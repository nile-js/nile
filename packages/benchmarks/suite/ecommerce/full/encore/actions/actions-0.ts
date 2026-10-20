import { api } from "encore.dev/api";
import { createRawHandler } from "./workload";

/** Compiler-visible ecommerce endpoint 0. */
export const action0 = api.raw(
  { expose: true, method: ["POST", "OPTIONS"], path: "/api/shop-0/catalog" },
  createRawHandler(0)
);

/** Compiler-visible ecommerce endpoint 1. */
export const action1 = api.raw(
  { expose: true, method: ["POST", "OPTIONS"], path: "/api/shop-0/product" },
  createRawHandler(1)
);

/** Compiler-visible ecommerce endpoint 2. */
export const action2 = api.raw(
  { expose: true, method: ["POST", "OPTIONS"], path: "/api/shop-0/cart" },
  createRawHandler(2)
);

/** Compiler-visible ecommerce endpoint 3. */
export const action3 = api.raw(
  { expose: true, method: ["POST", "OPTIONS"], path: "/api/shop-0/quote" },
  createRawHandler(3)
);

/** Compiler-visible ecommerce endpoint 4. */
export const action4 = api.raw(
  { expose: true, method: ["POST", "OPTIONS"], path: "/api/shop-0/checkout" },
  createRawHandler(4)
);

/** Compiler-visible ecommerce endpoint 5. */
export const action5 = api.raw(
  { expose: true, method: ["POST", "OPTIONS"], path: "/api/shop-0/order" },
  createRawHandler(5)
);

/** Compiler-visible ecommerce endpoint 6. */
export const action6 = api.raw(
  { expose: true, method: ["POST", "OPTIONS"], path: "/api/shop-1/catalog" },
  createRawHandler(6)
);

/** Compiler-visible ecommerce endpoint 7. */
export const action7 = api.raw(
  { expose: true, method: ["POST", "OPTIONS"], path: "/api/shop-1/product" },
  createRawHandler(7)
);

/** Compiler-visible ecommerce endpoint 8. */
export const action8 = api.raw(
  { expose: true, method: ["POST", "OPTIONS"], path: "/api/shop-1/cart" },
  createRawHandler(8)
);

/** Compiler-visible ecommerce endpoint 9. */
export const action9 = api.raw(
  { expose: true, method: ["POST", "OPTIONS"], path: "/api/shop-1/quote" },
  createRawHandler(9)
);

/** Compiler-visible ecommerce endpoint 10. */
export const action10 = api.raw(
  { expose: true, method: ["POST", "OPTIONS"], path: "/api/shop-1/checkout" },
  createRawHandler(10)
);

/** Compiler-visible ecommerce endpoint 11. */
export const action11 = api.raw(
  { expose: true, method: ["POST", "OPTIONS"], path: "/api/shop-1/order" },
  createRawHandler(11)
);

/** Compiler-visible ecommerce endpoint 12. */
export const action12 = api.raw(
  { expose: true, method: ["POST", "OPTIONS"], path: "/api/shop-2/catalog" },
  createRawHandler(12)
);

/** Compiler-visible ecommerce endpoint 13. */
export const action13 = api.raw(
  { expose: true, method: ["POST", "OPTIONS"], path: "/api/shop-2/product" },
  createRawHandler(13)
);

/** Compiler-visible ecommerce endpoint 14. */
export const action14 = api.raw(
  { expose: true, method: ["POST", "OPTIONS"], path: "/api/shop-2/cart" },
  createRawHandler(14)
);

/** Compiler-visible ecommerce endpoint 15. */
export const action15 = api.raw(
  { expose: true, method: ["POST", "OPTIONS"], path: "/api/shop-2/quote" },
  createRawHandler(15)
);

/** Compiler-visible ecommerce endpoint 16. */
export const action16 = api.raw(
  { expose: true, method: ["POST", "OPTIONS"], path: "/api/shop-2/checkout" },
  createRawHandler(16)
);

/** Compiler-visible ecommerce endpoint 17. */
export const action17 = api.raw(
  { expose: true, method: ["POST", "OPTIONS"], path: "/api/shop-2/order" },
  createRawHandler(17)
);

/** Compiler-visible ecommerce endpoint 18. */
export const action18 = api.raw(
  { expose: true, method: ["POST", "OPTIONS"], path: "/api/shop-3/catalog" },
  createRawHandler(18)
);

/** Compiler-visible ecommerce endpoint 19. */
export const action19 = api.raw(
  { expose: true, method: ["POST", "OPTIONS"], path: "/api/shop-3/product" },
  createRawHandler(19)
);

/** Compiler-visible ecommerce endpoint 20. */
export const action20 = api.raw(
  { expose: true, method: ["POST", "OPTIONS"], path: "/api/shop-3/cart" },
  createRawHandler(20)
);

/** Compiler-visible ecommerce endpoint 21. */
export const action21 = api.raw(
  { expose: true, method: ["POST", "OPTIONS"], path: "/api/shop-3/quote" },
  createRawHandler(21)
);

/** Compiler-visible ecommerce endpoint 22. */
export const action22 = api.raw(
  { expose: true, method: ["POST", "OPTIONS"], path: "/api/shop-3/checkout" },
  createRawHandler(22)
);

/** Compiler-visible ecommerce endpoint 23. */
export const action23 = api.raw(
  { expose: true, method: ["POST", "OPTIONS"], path: "/api/shop-3/order" },
  createRawHandler(23)
);

/** Compiler-visible ecommerce endpoint 24. */
export const action24 = api.raw(
  { expose: true, method: ["POST", "OPTIONS"], path: "/api/shop-4/catalog" },
  createRawHandler(24)
);

/** Compiler-visible ecommerce endpoint 25. */
export const action25 = api.raw(
  { expose: true, method: ["POST", "OPTIONS"], path: "/api/shop-4/product" },
  createRawHandler(25)
);

/** Compiler-visible ecommerce endpoint 26. */
export const action26 = api.raw(
  { expose: true, method: ["POST", "OPTIONS"], path: "/api/shop-4/cart" },
  createRawHandler(26)
);

/** Compiler-visible ecommerce endpoint 27. */
export const action27 = api.raw(
  { expose: true, method: ["POST", "OPTIONS"], path: "/api/shop-4/quote" },
  createRawHandler(27)
);

/** Compiler-visible ecommerce endpoint 28. */
export const action28 = api.raw(
  { expose: true, method: ["POST", "OPTIONS"], path: "/api/shop-4/checkout" },
  createRawHandler(28)
);

/** Compiler-visible ecommerce endpoint 29. */
export const action29 = api.raw(
  { expose: true, method: ["POST", "OPTIONS"], path: "/api/shop-4/order" },
  createRawHandler(29)
);
