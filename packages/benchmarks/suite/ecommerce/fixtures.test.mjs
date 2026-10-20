// biome-ignore-all lint/suspicious/noMisplacedAssertion: Standalone integration verifier runs assertions through shared helpers.
import assert from "node:assert/strict";
import { safeTry } from "slang-ts";
import { CONTENDERS, createFixture } from "./fixtures.mjs";
import { createJourney, createStore, CUSTOMER } from "./workload.mjs";
import { prepareJourneys } from "./client.mjs";

/** Verify independently known monetary values before relying on dynamic journey expectations. */
function verifyPricing() {
  const store = createStore();
  store.execute(
    "shop-0",
    "cart",
    {
      cartId: "test",
      items: [
        { sku: 0, quantity: 2 },
        { sku: 1, quantity: 1 },
      ],
    },
    CUSTOMER
  );
  const quote = store.execute(
    "shop-0",
    "quote",
    { cartId: "test", coupon: "SAVE10" },
    CUSTOMER
  );
  assert.deepEqual(quote.value, {
    cartId: "test",
    subtotalCents: 1537,
    discountCents: 153,
    taxCents: 249,
    shippingCents: 500,
    totalCents: 2133,
  });
  assert.equal(
    store.execute("shop-0", "quote", { cartId: "test" }, "intruder").isErr,
    true
  );
  const checkout = store.execute(
    "shop-0",
    "checkout",
    { cartId: "test", address: { country: "UG", city: "Kampala" } },
    CUSTOMER
  );
  assert.equal(checkout.value.totalCents, 2133);
  assert.equal(
    store.execute("shop-0", "checkout", { cartId: "test" }, CUSTOMER).isErr,
    true
  );
  assert.equal(
    store.execute("shop-0", "order", { orderId: "order-test" }, "intruder")
      .isErr,
    true
  );
}

/** Cover every registered route with a complete authenticated journey and isolated state. */
async function checkFixture(framework, mode) {
  const fixture = await createFixture(framework, mode);
  assert.equal(fixture.routeCount, 300);
  const plans = prepareJourneys(framework, 50, "test");
  for (const plan of plans) {
    for (const step of plan) {
      const response = await fixture.fetch(
        new Request(`http://localhost${step.path}`, {
          method: "POST",
          headers: fixture.headers,
          body: step.body,
        })
      );
      assert.equal(response.status, 200, `${framework}/${mode}`);
      assert.equal(
        await response.text(),
        step.expected,
        `${framework}/${mode}`
      );
    }
  }
  assert.deepEqual(fixture.state(), { carts: 0, orders: 50 });
  fixture.reset();
  assert.deepEqual(fixture.state(), { carts: 0, orders: 0 });
  const first = plans[0][0];
  const denied = await fixture.fetch(
    new Request(`http://localhost${first.path}`, {
      method: "POST",
      headers: { ...fixture.headers, authorization: "Bearer invalid" },
      body: first.body,
    })
  );
  assert.equal(denied.status, 400);
  assert.equal((await denied.json()).status, false);
  const preflight = await fixture.fetch(
    new Request(`http://localhost${first.path}`, {
      method: "OPTIONS",
      headers: {
        origin: fixture.headers.origin,
        "access-control-request-method": "POST",
      },
    })
  );
  assert.equal(preflight.status, 204);
  assert.equal(
    preflight.headers.get("access-control-allow-origin"),
    fixture.headers.origin
  );
  const missing = await fixture.fetch(new Request("http://localhost/missing"));
  assert.equal(missing.status, 404);
  if (mode === "validated") {
    const step = createJourney(0)[0];
    const body = JSON.stringify(
      framework.startsWith("nile-")
        ? {
            intent: "execute",
            service: step.shop,
            action: step.operation,
            payload: { page: -1 },
          }
        : { page: -1 }
    );
    const invalid = await fixture.fetch(
      new Request(`http://localhost${first.path}`, {
        method: "POST",
        headers: fixture.headers,
        body,
      })
    );
    assert.equal(invalid.status, 400);
  }
  console.log(
    `PASS ${framework}/${mode}: all 300 operations, state, JWT, CORS, validation`
  );
}

verifyPricing();
const result = await safeTry(async () => {
  for (const framework of CONTENDERS) {
    for (const mode of ["plain", "validated"]) {
      await checkFixture(framework, mode);
    }
  }
});
if (result.isErr) {
  throw new Error(String(result.error));
}
console.log("All ten ecommerce fixtures passed; no listeners started.");
