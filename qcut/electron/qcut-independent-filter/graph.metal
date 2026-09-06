struct GraphConfig { uint kind; uint alphaWeighted; float corner; uint overlayWidth; uint overlayHeight; uint detailVariant; };

float3 graphCube(texture3d<float> cube, sampler sampling, float3 color, bool texelCenters) {
    float n = float(cube.get_width());
    float3 uv = clamp(color, 0.0, 1.0);
    if (texelCenters) uv = uv * ((n - 1.0) / n) + 0.5 / n;
    return cube.sample(sampling, uv).rgb;
}

float4 graphSharpen(texture2d<float> source, sampler sampling, float2 uv, constant Parameters& params, float scale = 1.0) {
    float4 original = source.sample(sampling, uv);
    float3 center = original.a > 0 ? original.rgb / original.a : float3(0);
    float resolution = clamp((max(params.width, params.height) - 1000.0) / 2000.0, 0.0, 1.0);
    float gain = params.strength * scale * 4.0 * mix(0.65, 1.2, resolution) + 1.0;
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

float4 graphSmallBlur(texture2d<float> source, sampler sampling, float2 uv, float2 step) {
    float weight = exp(-1.0 / 224.0);
    float4 sum = source.sample(sampling, uv);
    sum += source.sample(sampling, uv + step) * weight;
    sum += source.sample(sampling, uv - step) * weight;
    return sum / (1.0 + 2.0 * weight);
}

float4 graphEdges(texture2d<float> source, sampler sampling, float2 uv) {
    float horizontal = 0, vertical = 0;
    for (int x = -1; x <= 1; ++x) {
        for (int y = -1; y <= 1; ++y) {
            float value = length(source.sample(sampling, uv + float2(x, y) / 512.0).rgb);
            horizontal += value * float(-x) * (y == 0 ? 2.0 : 1.0);
            vertical += value * float(-y) * (x == 0 ? 2.0 : 1.0);
        }
    }
    float4 pixel = source.sample(sampling, uv);
    float2 squared = float2(horizontal * horizontal, vertical * vertical);
    return float4(pixel.rgb + 0.02 * length(squared), pixel.a);
}

fragment float4 graphFrame(VertexOutput in [[stage_in]], constant Parameters& params [[buffer(0)]],
                           constant GraphConfig& graph [[buffer(1)]], texture2d<float> source [[texture(0)]],
                           texture3d<float> cube [[texture(1)]], texture2d<float> overlay [[texture(2)]],
                           sampler sampling [[sampler(0)]], texture2d<float> detailBase [[texture(3)]]) {
    if (graph.kind == 9 || graph.kind == 10) {
        if (graph.kind == 10 && params.stage == 0) return graphSharpen(source, sampling, in.uv, params, 0.6);
        float4 pixel = source.sample(sampling, in.uv);
        float4 result = float4(mix(pixel.rgb, graphCube(cube, sampling, pixel.rgb, true), params.strength), pixel.a);
        return graph.kind == 9 ? clamp(result, 0.0, pixel.a) : result;
    }
    if (graph.kind == 7 && params.stage == 0) return graphEdges(source, sampling, in.uv);
    if (graph.kind == 7 && params.stage == 1) {
        float4 pixel = source.sample(sampling, in.uv);
        pixel.r = source.sample(sampling, float2(in.uv.x * 0.9975, in.uv.y)).r;
        pixel.b = source.sample(sampling, float2(in.uv.x * 1.0025, in.uv.y)).b;
        return pixel;
    }
    if (graph.kind == 8 && params.stage < 6) {
        float4 pixel = source.sample(sampling, in.uv);
        if (params.stage == 2) {
            float3 difference = abs(pixel.rgb - detailBase.sample(sampling, in.uv).rgb);
            return float4(difference * step(float3(0.1), difference), 1.0);
        }
        if (params.stage == 5) return float4(min(pixel.rgb + detailBase.sample(sampling, in.uv).rgb, 1.0), pixel.a);
        bool horizontal = params.stage == 0 || params.stage == 3;
        float distance = params.stage < 2 ? 2.0 : 1.0;
        return graphSmallBlur(source, sampling, in.uv,
            horizontal ? float2(distance / params.width, 0) : float2(0, distance / params.height));
    }
    if (graph.kind == 4 || graph.kind == 7 || graph.kind == 8) {
        uint stage = params.stage - (graph.kind == 7 ? 2 : graph.kind == 8 ? 6 : 0);
        float4 pixel = source.sample(sampling, in.uv);
        if (stage < 2) return pixel;
        if (stage < 4) {
            float2 step = stage == 2 ? float2(1.0 / params.width, 0) : float2(0, 1.0 / params.height);
            float4 blurred = graphSmallBlur(source, sampling, in.uv, step);
            if (stage == 2) return blurred;
            float4 base = detailBase.sample(sampling, in.uv);
            float sharpness = graph.kind == 7 ? 1.0 : (graph.kind == 8 || graph.detailVariant == 1) ? 1.2 : 1.35;
            return base + (base - blurred) * sharpness;
        }
        float weight = params.strength * (graph.alphaWeighted ? pixel.a : 1.0);
        return float4(mix(pixel.rgb, graphCube(cube, sampling, pixel.rgb, true), weight), pixel.a);
    }
    if (graph.kind == 5) {
        float4 pixel = source.sample(sampling, in.uv);
        return float4(mix(pixel.rgb, graphCube(cube, sampling, pixel.rgb, true), params.strength * pixel.a), pixel.a);
    }
    if (graph.kind == 6) {
        if (params.stage < 2) return blurAxis(source, sampling, in.uv, params, params.stage == 0, 0.60);
        float4 pixel = source.sample(sampling, in.uv);
        if (params.stage == 2) return applyFog(detailBase.sample(sampling, in.uv), pixel, params.strength, 0.30);
        return float4(mix(pixel.rgb, graphCube(cube, sampling, pixel.rgb, true), params.strength), pixel.a);
    }
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
