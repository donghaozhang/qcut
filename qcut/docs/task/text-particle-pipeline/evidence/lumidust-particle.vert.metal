#pragma clang diagnostic ignored "-Wmissing-prototypes"

#include <metal_stdlib>
#include <simd/simd.h>

using namespace metal;

// Implementation of the GLSL mod() function, which is slightly different than Metal fmod()
template<typename Tx, typename Ty>
inline Tx mod(Tx x, Ty y)
{
    return x - y * floor(x / y);
}

struct buffer_t
{
    float4 u_ScreenParams;
    float mask_line_rot;
    float distorIns;
    float gravity;
    float gravityRot;
    int maskType;
    float noiseFeather;
    float progress;
    float mask_line_feather;
};

struct main0_out
{
    float2 sprite_uv [[user(locn0)]];
    float4 particleColor [[user(locn1)]];
    float particleOpacity [[user(locn2)]];
    float4 gl_Position [[position]];
    float gl_PointSize [[point_size]];
};

struct main0_in
{
    float3 attPosition [[attribute(0)]];
    float2 attUV [[attribute(2)]];
};

static inline __attribute__((always_inline))
float2x2 _f1(thread const float& _p0)
{
    float _48 = cos(_p0);
    float _51 = sin(_p0);
    return float2x2(float2(_48, -_51), float2(_51, _48));
}

static inline __attribute__((always_inline))
float2 _f2(thread const float4& _p0)
{
    return float2(_p0.x + (_p0.y / 255.0), _p0.z + (_p0.w / 255.0));
}

static inline __attribute__((always_inline))
float _f0(thread const float3& _p0)
{
    return ((0.2989999949932098388671875 * _p0.x) + (0.58700001239776611328125 * _p0.y)) + (0.114000000059604644775390625 * _p0.z);
}

vertex main0_out main0(main0_in in [[stage_in]], constant buffer_t& buffer, texture2d<float> noiseTex [[texture(0)]], texture2d<float> maskNoiseTex [[texture(1)]], texture2d<float> mask_image [[texture(2)]], texture2d<float> inputTex [[texture(3)]], sampler noiseTexSmplr [[sampler(0)]], sampler maskNoiseTexSmplr [[sampler(1)]], sampler mask_imageSmplr [[sampler(2)]], sampler inputTexSmplr [[sampler(3)]], uint gl_InstanceID [[instance_id]])
{
    main0_out out = {};
    float _93 = float(gl_InstanceID);
    out.sprite_uv = in.attUV;
    out.gl_PointSize = 1.0;
    float2 _128 = float2((floor(_93 / buffer.u_ScreenParams.y) + 0.5) / buffer.u_ScreenParams.x, (mod(_93, buffer.u_ScreenParams.y) + 0.5) / buffer.u_ScreenParams.y);
    float param = buffer.mask_line_rot;
    float2 _t9 = ((_128 - float2(0.5)) * _f1(param)) + float2(0.5);
    float _155 = 1.41421353816986083984375 * cos(0.7853000164031982421875 - (abs(mod((buffer.mask_line_rot / 0.7853000164031982421875) + 1.0, 2.0) - 1.0) * 0.7853000164031982421875));
    float _t12 = 1.0;
    float4 param_1 = noiseTex.sample(noiseTexSmplr, _128, level(0.0));
    float2 _t13 = _f2(param_1);
    float _178 = fast::min(buffer.u_ScreenParams.x, buffer.u_ScreenParams.y);
    float _t14 = (((_t13.x - 0.5) / buffer.u_ScreenParams.x) * _178) * buffer.distorIns;
    float _t15 = (((_t13.y - 0.5) / buffer.u_ScreenParams.y) * _178) * buffer.distorIns;
    float2 _204 = float2(0.0, -buffer.gravity);
    float2 _t16 = _204;
    float param_2 = buffer.gravityRot;
    _t16 = _204 * _f1(param_2);
    _t14 += _t16.x;
    _t15 += _t16.y;
    if (buffer.maskType == 0)
    {
        float4 param_3 = maskNoiseTex.sample(maskNoiseTexSmplr, _128, level(0.0));
        float2 _t17 = _f2(param_3);
        float _244 = buffer.progress * (1.0 + buffer.noiseFeather);
        float _253 = smoothstep((-buffer.noiseFeather) + _244, 0.0 + _244, _t17.x);
        float _256 = 1.0 - _253;
        _t14 *= pow(_256, 0.89999997615814208984375);
        _t15 *= pow(_256, 1.10000002384185791015625);
        _t12 = pow(_253, 0.300000011920928955078125);
    }
    else
    {
        if (buffer.maskType == 1)
        {
            float _286 = fast::min((0.00999999977648258209228515625 * buffer.mask_line_feather) * 100.0, 0.100000001490116119384765625) + 0.001000000047497451305389404296875;
            float _288 = -_286;
            float _296 = buffer.progress * ((1.0 + _286) + buffer.mask_line_feather);
            float _305 = buffer.progress * ((1.0 + buffer.mask_line_feather) + _286);
            _t12 = smoothstep((_288 - buffer.mask_line_feather) + _296, (0.0 - buffer.mask_line_feather) + _305, ((_t9.x - 0.5) / _155) + 0.5);
            float _348 = 1.0 - smoothstep((_288 + buffer.mask_line_feather) + _296, (0.0 + buffer.mask_line_feather) + _305, ((_t9.x - 0.5) / _155) + 0.5);
            _t14 *= _348;
            _t15 *= _348;
        }
        else
        {
            if (buffer.maskType == 2)
            {
                float4 _365 = mask_image.sample(mask_imageSmplr, _128, level(0.0));
                float4 _t22 = _365;
                float3 param_4 = _365.xyz;
                float _378 = buffer.progress * (1.0 + buffer.noiseFeather);
                float _387 = smoothstep((-buffer.noiseFeather) + _378, 0.0 + _378, _t22.x);
                float _390 = 1.0 - _387;
                _t14 *= pow(_390, 0.75);
                _t15 *= pow(_390, 1.33000004291534423828125);
                _t12 = fast::clamp(_387 * 10.0, 0.0, 1.0);
            }
        }
    }
    out.particleColor = inputTex.sample(inputTexSmplr, _128, level(0.0));
    out.particleColor.w *= _t12;
    out.gl_Position = float4(float3((in.attPosition.xy + (_128 * 2.0)) - float2(1.0), 0.0) + (float3(_t14, _t15, fast::clamp(_t14 + _t15, -1.0, 1.0)) * buffer.progress), 1.0);
    out.gl_Position.z = (out.gl_Position.z + out.gl_Position.w) * 0.5;       // Adjust clip-space for Metal
    return out;
}

