struct GraphConfig { uint kind; uint alphaWeighted; float corner; uint overlayWidth; uint overlayHeight; uint reserved; };

float3 graphCube(texture3d<float> cube, sampler sampling, float3 color, bool texelCenters) {
    float n = float(cube.get_width());
    float3 uv = clamp(color, 0.0, 1.0);
    if (texelCenters) uv = uv * ((n - 1.0) / n) + 0.5 / n;
    return cube.sample(sampling, uv).rgb;
}

float4 graphSharpen(texture2d<float> source, sampler sampling, float2 uv, constant Parameters& params) {
    float4 original = source.sample(sampling, uv);
    float3 center = original.a > 0 ? original.rgb / original.a : float3(0);
    float resolution = clamp((max(params.width, params.height) - 1000.0) / 2000.0, 0.0, 1.0);
    float gain = params.strength * 4.0 * mix(0.65, 1.2, resolution) + 1.0;
    float neighborGain = (1.0 - gain) * 0.25;
    float3 sharpened = center * gain;
    constexpr float2 offsets[] = {{-1,0}, {1,0}, {0,-1}, {0,1}};
    for (uint i = 0; i < 4; ++i) {
        float4 neighbor = source.sample(sampling, uv + offsets[i] / float2(params.width, params.height));
        sharpened += neighborGain * neighbor.rgb / (neighbor.a + 0.001);
    }
    return float4(clamp(sharpened, 0.0, 1.0) * original.a, original.a);
}

float4 graphBilateral(texture2d<float> source, sampler sampling, float2 uv, constant Parameters& params, bool adaptive) {
    float4 center = source.sample(sampling, uv);
    float radius = mix(0.001, 8.0, 0.19 * params.strength);
    float threshold = mix(0.001, 25.0, 0.31 * params.strength) / 255.0;
    float3 sum = 0, weights = 0;
    // Vignette packages keep fixed uniforms; camera packages normalize the short side.
    float scale = min(params.width, params.height) / 720.0;
    float2 dimensions = adaptive ? floor(float2(params.width, params.height) / scale) : float2(720.0, 1280.0);
    float2 texel = 1.0 / dimensions;
    for (int x = -int(floor(radius)); x <= int(floor(radius)); ++x) {
        // Preserve accumulation order across RGBA8 passes.
        float4 middle = source.sample(sampling, uv + float2(x, 0) * texel);
        float3 weight = max(1.0 - abs(center.rgb - middle.rgb) / (2.5 * threshold), 0.0);
        sum += middle.rgb * weight; weights += weight;
        for (int y = 1; y <= int(floor(radius)); ++y) {
            float4 a = source.sample(sampling, uv + float2(x, y) * texel);
            float4 b = source.sample(sampling, uv + float2(x, -y) * texel);
            float3 wa = max(1.0 - abs(center.rgb - a.rgb) / (2.5 * threshold), 0.0);
            float3 wb = max(1.0 - abs(center.rgb - b.rgb) / (2.5 * threshold), 0.0);
            sum += a.rgb * wa; sum += b.rgb * wb; weights += wa + wb;
        }
    }
    return float4(clamp(sum / weights, 0.0, 1.0), center.a);
}

fragment float4 graphFrame(VertexOutput in [[stage_in]], constant Parameters& params [[buffer(0)]],
                           constant GraphConfig& graph [[buffer(1)]], texture2d<float> source [[texture(0)]],
                           texture3d<float> cube [[texture(1)]], texture2d<float> overlay [[texture(2)]],
                           sampler sampling [[sampler(0)]]) {
    if (graph.kind == 1 && params.stage == 0) return graphSharpen(source, sampling, in.uv, params);
    if (graph.kind >= 2 && params.stage == 1) return graphBilateral(source, sampling, in.uv, params, graph.kind == 3);
    float4 pixel = source.sample(sampling, in.uv);
    if (graph.kind == 2 && params.stage == 2) {
        float4 texture = overlay.sample(sampling, float2(in.uv.x, 1.0 - in.uv.y));
        texture.rgb *= texture.a;
        texture *= graph.corner * params.strength;
        return texture + pixel * (1.0 - texture.a);
    }
    float3 input = graph.kind >= 2 ? pixel.rgb / (pixel.a + 0.0001) : pixel.rgb;
    float3 graded = graphCube(cube, sampling, input, graph.kind != 0);
    float strength = params.strength * (graph.alphaWeighted ? pixel.a : 1.0);
    float3 result = mix(input, graded, strength);
    if (graph.kind >= 2) result *= pixel.a;
    return float4(result, pixel.a);
}
