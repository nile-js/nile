import { safeTry } from "slang-ts";
import { checkAdmission, prepareJourneys, runLoad } from "./client.mjs";
import { CONTENDERS, createFixture } from "./fixtures.mjs";

/** Check real Bun-native route compilation and Elysia listen before beginning measured rounds. */
async function runSmoke() {
  for (const framework of CONTENDERS) {
    const fixture = await createFixture(framework, "validated");
    const server = fixture.start();
    const result = await safeTry(async () => {
      const connection = {
        url: String(server.url).slice(0, -1),
        headers: fixture.headers,
      };
      await checkAdmission(connection, framework, "validated");
      fixture.reset();
      await runLoad(connection, prepareJourneys(framework, 50, "smoke"));
      const state = fixture.state();
      if (state.carts !== 0 || state.orders !== 50) {
        throw new Error("Bad final state");
      }
    });
    await server.stop(true);
    if (result.isErr) { throw new Error(`${framework}: ${result.error}`); }
    console.log(
      `PASS real listener ${framework}: 300 operations and admission checks`
    );
  }
}
await runSmoke();
