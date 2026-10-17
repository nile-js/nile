import { api } from "encore.dev/api";
import { buildNativeOutput } from "./workload";
import type { BenchmarkOutput, NativeInput } from "./workload";

/** Native endpoint 0; literal declarations are required by the Encore compiler. */
export const action0 = api<NativeInput, BenchmarkOutput>(
  { expose: true, method: "POST", path: "/actions/action-0" },
  async (body) => buildNativeOutput(body, 0)
);

/** Native endpoint 1; literal declarations are required by the Encore compiler. */
export const action1 = api<NativeInput, BenchmarkOutput>(
  { expose: true, method: "POST", path: "/actions/action-1" },
  async (body) => buildNativeOutput(body, 1)
);

/** Native endpoint 2; literal declarations are required by the Encore compiler. */
export const action2 = api<NativeInput, BenchmarkOutput>(
  { expose: true, method: "POST", path: "/actions/action-2" },
  async (body) => buildNativeOutput(body, 2)
);

/** Native endpoint 3; literal declarations are required by the Encore compiler. */
export const action3 = api<NativeInput, BenchmarkOutput>(
  { expose: true, method: "POST", path: "/actions/action-3" },
  async (body) => buildNativeOutput(body, 3)
);

/** Native endpoint 4; literal declarations are required by the Encore compiler. */
export const action4 = api<NativeInput, BenchmarkOutput>(
  { expose: true, method: "POST", path: "/actions/action-4" },
  async (body) => buildNativeOutput(body, 4)
);

/** Native endpoint 5; literal declarations are required by the Encore compiler. */
export const action5 = api<NativeInput, BenchmarkOutput>(
  { expose: true, method: "POST", path: "/actions/action-5" },
  async (body) => buildNativeOutput(body, 5)
);

/** Native endpoint 6; literal declarations are required by the Encore compiler. */
export const action6 = api<NativeInput, BenchmarkOutput>(
  { expose: true, method: "POST", path: "/actions/action-6" },
  async (body) => buildNativeOutput(body, 6)
);

/** Native endpoint 7; literal declarations are required by the Encore compiler. */
export const action7 = api<NativeInput, BenchmarkOutput>(
  { expose: true, method: "POST", path: "/actions/action-7" },
  async (body) => buildNativeOutput(body, 7)
);

/** Native endpoint 8; literal declarations are required by the Encore compiler. */
export const action8 = api<NativeInput, BenchmarkOutput>(
  { expose: true, method: "POST", path: "/actions/action-8" },
  async (body) => buildNativeOutput(body, 8)
);

/** Native endpoint 9; literal declarations are required by the Encore compiler. */
export const action9 = api<NativeInput, BenchmarkOutput>(
  { expose: true, method: "POST", path: "/actions/action-9" },
  async (body) => buildNativeOutput(body, 9)
);

/** Native endpoint 10; literal declarations are required by the Encore compiler. */
export const action10 = api<NativeInput, BenchmarkOutput>(
  { expose: true, method: "POST", path: "/actions/action-10" },
  async (body) => buildNativeOutput(body, 10)
);

/** Native endpoint 11; literal declarations are required by the Encore compiler. */
export const action11 = api<NativeInput, BenchmarkOutput>(
  { expose: true, method: "POST", path: "/actions/action-11" },
  async (body) => buildNativeOutput(body, 11)
);

/** Native endpoint 12; literal declarations are required by the Encore compiler. */
export const action12 = api<NativeInput, BenchmarkOutput>(
  { expose: true, method: "POST", path: "/actions/action-12" },
  async (body) => buildNativeOutput(body, 12)
);

/** Native endpoint 13; literal declarations are required by the Encore compiler. */
export const action13 = api<NativeInput, BenchmarkOutput>(
  { expose: true, method: "POST", path: "/actions/action-13" },
  async (body) => buildNativeOutput(body, 13)
);

/** Native endpoint 14; literal declarations are required by the Encore compiler. */
export const action14 = api<NativeInput, BenchmarkOutput>(
  { expose: true, method: "POST", path: "/actions/action-14" },
  async (body) => buildNativeOutput(body, 14)
);

/** Native endpoint 15; literal declarations are required by the Encore compiler. */
export const action15 = api<NativeInput, BenchmarkOutput>(
  { expose: true, method: "POST", path: "/actions/action-15" },
  async (body) => buildNativeOutput(body, 15)
);

/** Native endpoint 16; literal declarations are required by the Encore compiler. */
export const action16 = api<NativeInput, BenchmarkOutput>(
  { expose: true, method: "POST", path: "/actions/action-16" },
  async (body) => buildNativeOutput(body, 16)
);

/** Native endpoint 17; literal declarations are required by the Encore compiler. */
export const action17 = api<NativeInput, BenchmarkOutput>(
  { expose: true, method: "POST", path: "/actions/action-17" },
  async (body) => buildNativeOutput(body, 17)
);

/** Native endpoint 18; literal declarations are required by the Encore compiler. */
export const action18 = api<NativeInput, BenchmarkOutput>(
  { expose: true, method: "POST", path: "/actions/action-18" },
  async (body) => buildNativeOutput(body, 18)
);

/** Native endpoint 19; literal declarations are required by the Encore compiler. */
export const action19 = api<NativeInput, BenchmarkOutput>(
  { expose: true, method: "POST", path: "/actions/action-19" },
  async (body) => buildNativeOutput(body, 19)
);

/** Native endpoint 20; literal declarations are required by the Encore compiler. */
export const action20 = api<NativeInput, BenchmarkOutput>(
  { expose: true, method: "POST", path: "/actions/action-20" },
  async (body) => buildNativeOutput(body, 20)
);

/** Native endpoint 21; literal declarations are required by the Encore compiler. */
export const action21 = api<NativeInput, BenchmarkOutput>(
  { expose: true, method: "POST", path: "/actions/action-21" },
  async (body) => buildNativeOutput(body, 21)
);

/** Native endpoint 22; literal declarations are required by the Encore compiler. */
export const action22 = api<NativeInput, BenchmarkOutput>(
  { expose: true, method: "POST", path: "/actions/action-22" },
  async (body) => buildNativeOutput(body, 22)
);

/** Native endpoint 23; literal declarations are required by the Encore compiler. */
export const action23 = api<NativeInput, BenchmarkOutput>(
  { expose: true, method: "POST", path: "/actions/action-23" },
  async (body) => buildNativeOutput(body, 23)
);

/** Native endpoint 24; literal declarations are required by the Encore compiler. */
export const action24 = api<NativeInput, BenchmarkOutput>(
  { expose: true, method: "POST", path: "/actions/action-24" },
  async (body) => buildNativeOutput(body, 24)
);

/** Native endpoint 25; literal declarations are required by the Encore compiler. */
export const action25 = api<NativeInput, BenchmarkOutput>(
  { expose: true, method: "POST", path: "/actions/action-25" },
  async (body) => buildNativeOutput(body, 25)
);

/** Native endpoint 26; literal declarations are required by the Encore compiler. */
export const action26 = api<NativeInput, BenchmarkOutput>(
  { expose: true, method: "POST", path: "/actions/action-26" },
  async (body) => buildNativeOutput(body, 26)
);

/** Native endpoint 27; literal declarations are required by the Encore compiler. */
export const action27 = api<NativeInput, BenchmarkOutput>(
  { expose: true, method: "POST", path: "/actions/action-27" },
  async (body) => buildNativeOutput(body, 27)
);

/** Native endpoint 28; literal declarations are required by the Encore compiler. */
export const action28 = api<NativeInput, BenchmarkOutput>(
  { expose: true, method: "POST", path: "/actions/action-28" },
  async (body) => buildNativeOutput(body, 28)
);

/** Native endpoint 29; literal declarations are required by the Encore compiler. */
export const action29 = api<NativeInput, BenchmarkOutput>(
  { expose: true, method: "POST", path: "/actions/action-29" },
  async (body) => buildNativeOutput(body, 29)
);
