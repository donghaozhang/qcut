cmake_minimum_required(VERSION 3.16)
project(independent_soft_glow LANGUAGES CXX)

option(SOFT_GLOW_SANITIZERS "Enable address and undefined behavior sanitizers" OFF)

add_library(softglow STATIC image.cpp gaussian.cpp glow.cpp layer.cpp lut.cpp pipeline.cpp)
target_compile_features(softglow PUBLIC cxx_std_20)
target_include_directories(softglow PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}")

add_library(softglow_io STATIC image_io.cpp)
target_link_libraries(softglow_io PUBLIC softglow)

add_executable(soft-glow main.cpp)
target_link_libraries(soft-glow PRIVATE softglow_io)

add_executable(soft-glow-tests tests.cpp)
target_link_libraries(soft-glow-tests PRIVATE softglow_io)

add_library(softglow_stream_io STATIC stream_io.cpp)
target_link_libraries(softglow_stream_io PUBLIC softglow)

add_executable(soft-glow-stream stream_main.cpp)
target_link_libraries(soft-glow-stream PRIVATE softglow_stream_io softglow_io)

add_executable(soft-glow-stream-tests stream_tests.cpp)
target_link_libraries(soft-glow-stream-tests PRIVATE softglow_stream_io softglow_io)

foreach(target softglow softglow_io softglow_stream_io soft-glow soft-glow-tests soft-glow-stream soft-glow-stream-tests)
    if(MSVC)
        target_compile_options(${target} PRIVATE /W4 /WX)
    else()
        target_compile_options(${target} PRIVATE -Wall -Wextra -Wpedantic -Werror -ffp-contract=off)
        if(SOFT_GLOW_SANITIZERS)
            target_compile_options(${target} PRIVATE -fsanitize=address,undefined -fno-omit-frame-pointer)
            target_link_options(${target} PRIVATE -fsanitize=address,undefined)
        endif()
    endif()
endforeach()

enable_testing()
add_test(NAME soft-glow-algorithms COMMAND soft-glow-tests)
add_test(NAME soft-glow-stream-protocol COMMAND soft-glow-stream-tests)

find_package(Python3 COMPONENTS Interpreter QUIET)
if(Python3_Interpreter_FOUND)
    add_test(NAME soft-glow-cli-intensity
        COMMAND "${Python3_EXECUTABLE}" "${CMAKE_CURRENT_SOURCE_DIR}/cli_intensity_test.py"
            --image-cli "$<TARGET_FILE:soft-glow>"
            --stream-cli "$<TARGET_FILE:soft-glow-stream>")
endif()
