#pragma once

struct GraphStage {
    uint32_t width, height;
    float sampleWidth, sampleHeight;
    int source, base;
};

std::vector<GraphStage> makeGraphPlan(uint32_t kind, uint32_t variant, uint32_t width, uint32_t height, bool dualSharpen = false) {
    constexpr uint32_t counts[] = {1, 2, 3, 2, 5, 1, 4, 7, 11, 1, 2, 1};
    if (kind >= std::size(counts)) throw std::runtime_error("Unknown graph topology");
    std::vector<GraphStage> plan;
    const uint32_t count = kind == 11 && dualSharpen ? 2 : counts[kind];
    for (uint32_t index = 0; index < count; ++index)
        plan.push_back({width, height, float(width), float(height), int(index) - 1, -1});
    const bool detail = kind == 4 || kind == 7 || kind == 8;
    if (!detail) return plan;
    const uint32_t offset = kind == 7 ? 2 : kind == 8 ? 6 : 0;
    const double standard = kind == 8 ? 550.0 : (kind == 7 || variant == 1) ? 520.0 : 1000.0;
    const double longest = std::max(width, height);
    const double scale = longest > 1000 ? standard / 1000.0 * 1.1 : standard / longest;
    const uint32_t workingWidth = std::max(1u, uint32_t(width * scale));
    const uint32_t workingHeight = std::max(1u, uint32_t(height * scale));
    for (uint32_t index = offset; index < offset + 4; ++index) {
        plan[index].sampleWidth = workingWidth;
        plan[index].sampleHeight = workingHeight;
        if (index < offset + 3) {
            plan[index].width = workingWidth;
            plan[index].height = workingHeight;
        }
    }
    plan[offset + 3].base = offset + 1;
    if (kind == 8) {
        // Shared render targets have the detail camera's dimensions before any pass runs.
        for (uint32_t index : {1u, 4u}) {
            plan[index].width = workingWidth;
            plan[index].height = workingHeight;
        }
        for (uint32_t index : {0u, 1u, 3u, 4u}) {
            const double factor = index < 2 ? 0.5 : 0.35;
            plan[index].sampleWidth = std::max(1u, uint32_t(width * factor));
            plan[index].sampleHeight = std::max(1u, uint32_t(height * factor));
        }
        plan[2].source = -1;
        plan[2].base = 1;
        plan[5].source = -1;
        plan[5].base = 4;
    }
    return plan;
}
