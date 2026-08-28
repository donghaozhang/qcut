#include <dlfcn.h>

#include <iostream>
#include <stdexcept>
#include <string>

namespace {

using CreateHandle = int (*)(void **);
using InitModel = int (*)(void *, int, const char *);
using GetParam = int (*)(void *, int, int *);
using ReleaseHandle = int (*)(void *);

template <typename Function>
Function requireSymbol(void *library, const char *name) {
  auto *symbol = dlsym(library, name);
  if (!symbol) {
    throw std::runtime_error(std::string("missing symbol: ") + name);
  }
  return reinterpret_cast<Function>(symbol);
}

} // namespace

int main(int argc, char **argv) {
  if (argc != 4) {
    std::cerr << "usage: portrait-matting-param-probe <libcccreator> <model> "
                 "<model-type>\n";
    return 2;
  }

  try {
    void *library = dlopen(argv[1], RTLD_NOW | RTLD_LOCAL);
    if (!library) {
      throw std::runtime_error(std::string("cannot load runtime: ") +
                               dlerror());
    }
    const auto createHandle = requireSymbol<CreateHandle>(
        library, "bef_Portrait_Matting_CreateHandle");
    const auto initModel =
        requireSymbol<InitModel>(library, "bef_Portrait_Matting_InitModel");
    const auto getParam =
        requireSymbol<GetParam>(library, "bef_Portrait_Matting_GetParam");
    const auto releaseHandle = requireSymbol<ReleaseHandle>(
        library, "bef_Portrait_Matting_ReleaseHandle");

    void *handle = nullptr;
    const int createStatus = createHandle(&handle);
    if (createStatus != 0 || !handle) {
      throw std::runtime_error("cannot create matting handle: " +
                               std::to_string(createStatus));
    }

    const int modelType = std::stoi(argv[3]);
    const int initStatus = initModel(handle, modelType, argv[2]);
    if (initStatus != 0) {
      releaseHandle(handle);
      throw std::runtime_error("cannot initialize matting model: " +
                               std::to_string(initStatus));
    }

    for (int paramType = 0; paramType <= 8; ++paramType) {
      int value = -1;
      const int status = getParam(handle, paramType, &value);
      std::cout << "param=" << paramType << " status=" << status
                << " value=" << value << '\n';
    }

    releaseHandle(handle);
    dlclose(library);
    return 0;
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
