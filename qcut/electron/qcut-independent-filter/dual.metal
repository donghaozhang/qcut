struct DualConfig { float backgroundStrength; float skinStrength; uint sampling; uint clampAlpha; };

float3 sampleDualCube(texture3d<float> cube, sampler sampling, float3 color, uint mode) {
    float n = float(cube.get_width());
    float3 uv = clamp(color, 0.0, 1.0);
    if (mode == 2) uv.b = floor(uv.b * (n - 1.0)) / (n - 1.0);
    if (mode != 0) uv = uv * ((n - 1.0) / n) + 0.5 / n;
    return cube.sample(sampling, uv).rgb;
}

fragment float4 dualFrame(VertexOutput in [[stage_in]], constant Parameters& params [[buffer(0)]],
    constant GraphConfig& graph [[buffer(1)]], constant DualConfig& dual [[buffer(2)]],
    texture2d<float> source [[texture(0)]], texture3d<float> background [[texture(1)]],
    texture3d<float> skin [[texture(4)]], texture2d<float> mask [[texture(5)]], sampler sampling [[sampler(0)]]) {
    float4 pixel = source.sample(sampling, in.uv);
    float weight = mask.sample(sampling, float2(in.uv.x, 1.0 - in.uv.y)).r;
    float strength = params.strength * (graph.alphaWeighted ? pixel.a : 1.0);
    float3 bg = mix(pixel.rgb, sampleDualCube(background, sampling, pixel.rgb, dual.sampling), strength * dual.backgroundStrength);
    float3 face = mix(pixel.rgb, sampleDualCube(skin, sampling, pixel.rgb, dual.sampling), strength * dual.skinStrength);
    float4 output = float4(mix(bg, face, weight), pixel.a);
    return dual.clampAlpha ? clamp(output, 0.0, pixel.a) : output;
}
