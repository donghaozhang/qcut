#pragma once

#include "image.hpp"

namespace softglow {

// The atlas is top-down, 8 by 8 tiles containing a 64-cube; blue selects tiles.
Image identity_lut();
Image apply_lut(const Image& source, const Image& atlas, float opacity);

} // namespace softglow
