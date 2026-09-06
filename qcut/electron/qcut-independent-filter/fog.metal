#include <metal_stdlib>
using namespace metal;

struct VertexOutput { float4 position [[position]]; float2 uv; };
struct Parameters { float width; float height; float strength; uint stage; };

vertex VertexOutput fullFrame(uint index [[vertex_id]]) {
    constexpr float2 positions[] = {{-1, 1}, {-1, -1}, {1, 1}, {1, 1}, {-1, -1}, {1, -1}};
    float2 p = positions[index];
    return {float4(p, 0, 1), float2((p.x + 1) * 0.5, (1 - p.y) * 0.5)};
}

float4 thresholdAlpha(float4 color) {
    color.a = dot(color.rgb, float3(0.299, 0.587, 0.114)) > 0.5 ? 0.0 : 1.0;
    return color;
}

float4 blurAxis(texture2d<float> source, sampler sampling, float2 uv,
                constant Parameters& params, bool horizontal, float blurScale = 0.90) {
    constexpr float weights[] = {0.20, 0.19, 0.17, 0.15, 0.13, 0.11, 0.08, 0.05, 0.02};
    float blurSize = params.strength * blurScale * 4.0;
    float2 step = float2(blurSize / params.width, blurSize / params.height) * 1.25;
    float4 center = source.sample(sampling, uv);
    if (horizontal) center = thresholdAlpha(center);
    center *= weights[0];
    float4 accumulated = 0;
    float denominator = weights[0];
    for (int distance = 1; distance <= 8; ++distance) {
        float2 offset = (horizontal ? float2(distance, 0) : float2(0, distance)) * step;
        float4 positive = source.sample(sampling, uv + offset);
        float4 negative = source.sample(sampling, uv - offset);
        if (horizontal) { positive = thresholdAlpha(positive); negative = thresholdAlpha(negative); }
        accumulated += positive * weights[distance];
        accumulated += negative * weights[distance];
        denominator += weights[distance] * 2.0;
    }
    return (accumulated + center) / denominator;
}

float4 applyFog(float4 original, float4 blurred, float strength, float blendAmount = 0.50) {
    float shadowWeight = blurred.a * 0.457;
    blurred.a = 1;
    float4 softened = mix(original, blurred, float4(1.0 - shadowWeight));
    float4 screened = float4(1.0 - (1.0 - original.rgb) * (1.0 - softened.rgb), original.a);
    float4 result = mix(screened, softened, float4(0.25));
    result = mix(result, original, float4(1.0 - strength * blendAmount));
    result.a = original.a;
    return clamp(result, float4(0), float4(original.a));
}

float2 atlasCoordinates(float slice, float2 rg) {
    float row = floor(slice / 8.0);
    float column = slice - row * 8.0;
    return float2(column, row) / 8.0 + 0.5 / 512.0 + (1.0 / 8.0 - 1.0 / 512.0) * rg;
}

fragment float4 filterFrame(VertexOutput in [[stage_in]], constant Parameters& params [[buffer(0)]],
                            texture2d<float> primary [[texture(0)]], texture2d<float> secondary [[texture(1)]],
                            sampler sampling [[sampler(0)]]) {
    if (params.stage < 2) return blurAxis(primary, sampling, in.uv, params, params.stage == 0);
    float4 pixel = primary.sample(sampling, in.uv);
    if (params.stage == 2) return applyFog(pixel, secondary.sample(sampling, in.uv), params.strength);
    float slice = pixel.b * 63.0;
    float4 lower = secondary.sample(sampling, atlasCoordinates(floor(slice), pixel.rg));
    float4 upper = secondary.sample(sampling, atlasCoordinates(ceil(slice), pixel.rg));
    float4 graded = mix(lower, upper, float4(fract(slice)));
    return mix(pixel, float4(graded.rgb, pixel.a), float4(params.strength));
}

fragment float4 cubeFrame(VertexOutput in [[stage_in]], constant Parameters& params [[buffer(0)]],
                          texture2d<float> primary [[texture(0)]], texture3d<float> cube [[texture(1)]],
                          sampler sampling [[sampler(0)]]) {
    float4 pixel = primary.read(uint2(in.position.xy));
    float size = float(cube.get_width());
    float3 coordinates = clamp(pixel.rgb, 0.0, 1.0) * ((size - 1.0) / size) + 0.5 / size;
    float3 graded = cube.sample(sampling, coordinates).rgb;
    return float4(mix(pixel.rgb, graded, params.strength), pixel.a);
}
