import { z } from "zod";
import { Err, Ok } from "slang-ts";

export const OPERATIONS = [
  "catalog",
  "product",
  "cart",
  "quote",
  "checkout",
  "order",
];
export const SHOPS = Array.from({ length: 50 }, (_, index) => `shop-${index}`);
export const ORIGIN = "https://store.example";
export const SECRET = "isolated-ecommerce-benchmark-secret";
export const CUSTOMER = "customer-1";
const identifier = z.string().min(1).max(120);
const itemSchema = z.object({
  sku: z.number().int().min(0).max(99),
  quantity: z.number().int().min(1).max(10),
});
export const schemas = {
  catalog: z.object({ page: z.number().int().min(0).max(9) }),
  product: z.object({ sku: z.number().int().min(0).max(99) }),
  cart: z.object({
    cartId: identifier,
    items: z.array(itemSchema).min(1).max(10),
  }),
  quote: z.object({ cartId: identifier, coupon: z.literal("SAVE10") }),
  checkout: z.object({
    cartId: identifier,
    coupon: z.literal("SAVE10"),
    address: z.object({ country: z.literal("UG"), city: identifier }),
  }),
  order: z.object({ orderId: identifier }),
};
const PRODUCTS = Array.from({ length: 100 }, (_, sku) => ({
  sku,
  name: `Product ${sku}`,
  priceCents: 500 + sku * 37,
  category: `category-${sku % 8}`,
  available: true,
}));

/** Calculate cents deterministically; all adapters share the same pricing rules. */
export function calculateQuote(items) {
  const subtotalCents = items.reduce(
    (sum, item) => sum + PRODUCTS[item.sku].priceCents * item.quantity,
    0
  );
  const discountCents = Math.floor(subtotalCents / 10);
  const taxCents = Math.floor(((subtotalCents - discountCents) * 18) / 100);
  const shippingCents = subtotalCents >= 10_000 ? 0 : 500;
  return {
    subtotalCents,
    discountCents,
    taxCents,
    shippingCents,
    totalCents: subtotalCents - discountCents + taxCents + shippingCents,
  };
}

/** Each contender gets fresh mutable state; operations enforce ownership and consume carts atomically. */
export function createStore() {
  const carts = new Map();
  const orders = new Map();
  const handlers = {
    catalog: ({ page }) =>
      Ok({
        products: PRODUCTS.slice(page * 10, page * 10 + 10),
        total: PRODUCTS.length,
      }),
    product: ({ sku }) =>
      PRODUCTS[sku] ? Ok({ product: PRODUCTS[sku] }) : Err("Product not found"),
    cart: ({ cartId, items }, shop, customer) => {
      if (
        !items?.length ||
        items.some(
          (item) =>
            !PRODUCTS[item.sku] || item.quantity < 1 || item.quantity > 10
        )
      ) {
        return Err("Invalid cart");
      }
      const key = `${shop}/${cartId}`;
      const previous = carts.get(key);
      if (previous && previous.customer !== customer) {
        return Err("Cart forbidden");
      }
      carts.set(key, { items, customer });
      return Ok({
        cartId,
        itemCount: items.reduce((count, item) => count + item.quantity, 0),
      });
    },
    quote: ({ cartId }, shop, customer) => {
      const cart = carts.get(`${shop}/${cartId}`);
      if (!cart || cart.customer !== customer) {
        return Err("Cart not found");
      }
      return Ok({ cartId, ...calculateQuote(cart.items) });
    },
    checkout: ({ cartId, address }, shop, customer) => {
      const key = `${shop}/${cartId}`;
      const cart = carts.get(key);
      if (!cart || cart.customer !== customer) {
        return Err("Cart not found");
      }
      const orderId = `order-${cartId}`;
      const order = {
        orderId,
        customer,
        shop,
        items: cart.items,
        address,
        ...calculateQuote(cart.items),
        state: "confirmed",
      };
      orders.set(`${shop}/${orderId}`, order);
      carts.delete(key);
      return Ok({ orderId, totalCents: order.totalCents, state: order.state });
    },
    order: ({ orderId }, shop, customer) => {
      const order = orders.get(`${shop}/${orderId}`);
      return order?.customer === customer ? Ok(order) : Err("Order not found");
    },
  };
  return {
    execute: (shop, operation, payload, customer) =>
      handlers[operation](payload, shop, customer),
    state: () => ({ carts: carts.size, orders: orders.size }),
    reset: () => {
      carts.clear();
      orders.clear();
    },
  };
}

/** Bind route identity and operation-specific input schemas once at setup. */
export function createDefinitions() {
  return SHOPS.flatMap((shop) =>
    OPERATIONS.map((operation) => ({
      shop,
      operation,
      path: `/api/${shop}/${operation}`,
      schema: schemas[operation],
    }))
  );
}

/** Build deterministic shopping input and an independently calculated expected result. */
export function createJourney(sequence, phase = "measure") {
  const shop = SHOPS[sequence % SHOPS.length];
  const sku = (sequence * 37 + Math.floor(sequence / 50)) % 100;
  const cartId = `${phase}-${sequence}`;
  const orderId = `order-${cartId}`;
  const items = [
    { sku, quantity: 2 },
    { sku: (sku + 1) % 100, quantity: 1 },
  ];
  const address = { country: "UG", city: "Kampala" };
  const price = calculateQuote(items);
  const payloads = [
    { page: sequence % 10 },
    { sku },
    { cartId, items },
    { cartId, coupon: "SAVE10" },
    { cartId, coupon: "SAVE10", address },
    { orderId },
  ];
  const expected = [
    {
      products: PRODUCTS.slice((sequence % 10) * 10, (sequence % 10) * 10 + 10),
      total: 100,
    },
    { product: PRODUCTS[sku] },
    { cartId, itemCount: 3 },
    { cartId, ...price },
    { orderId, totalCents: price.totalCents, state: "confirmed" },
    {
      orderId,
      customer: CUSTOMER,
      shop,
      items,
      address,
      ...price,
      state: "confirmed",
    },
  ];
  return OPERATIONS.map((operation, index) => ({
    shop,
    operation,
    path: `/api/${shop}/${operation}`,
    payload: payloads[index],
    expected: expected[index],
  }));
}

/** Match Nile's wire response, including action identity, for every contender. */
export function serializeResult(shop, operation, result) {
  return result.isOk
    ? {
        status: true,
        message: `Action '${shop}.${operation}' executed`,
        data: result.value,
      }
    : { status: false, message: result.error, data: {} };
}
