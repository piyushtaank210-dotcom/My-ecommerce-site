import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, json } from "@/lib/api";
import { clearCart } from "@/lib/cart";
import { GATEWAY_NAME } from "@/lib/checkout";
import { getDb } from "@/lib/db";
import { gatewayIsConfigured } from "@/lib/gateway-config";
import { getOrder, notifyOrderPlaced } from "@/lib/orders";
import {
  fetchGatewayOrder,
  fetchGatewayPayment,
  verifyGatewaySignature,
} from "@/lib/payment-gateway";

const paymentSchema = z.object({
  razorpay_order_id: z.string().trim().min(1, "The order reference is missing."),
  razorpay_payment_id: z.string().trim().min(1, "The payment reference is missing."),
  razorpay_signature: z.string().trim().min(1, "The payment signature is missing."),
});

/**
 * POST /api/verify-payment — check that the payment is real.
 *
 * The gateway hands back three things when the money has been taken: the
 * order it made, the payment it took, and a signature over the two. The
 * signature is what proves the gateway took this payment for this
 * order, and it is checked first. Nothing is written, and nothing is
 * marked as paid, until it checks out.
 *
 * After that the gateway is asked about the payment and the order it
 * belongs to, in one go. The payment has to have been captured, it has
 * to belong to the order that was named, and it has to be for the amount
 * the shop's own order says is owed. The order is then written down as
 * paid, the customer is told, and the basket is emptied.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("Send the payment details as JSON.", 400);
  }

  const parsed = paymentSchema.safeParse(body);
  if (!parsed.success) {
    return fail("The payment details are missing.", 400);
  }
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsed.data;

  if (!gatewayIsConfigured()) {
    return fail(
      "The shop has not been given its payment gateway keys, so it cannot check the payment.",
      503
    );
  }

  // The proof. Everything else is checked against it.
  if (
    !verifyGatewaySignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    })
  ) {
    return fail(
      "The payment signature did not match, so the order has not been marked as paid.",
      400
    );
  }

  // The gateway's own record of the payment and of the order it belongs
  // to. They are asked for together — one wait, not two.
  const [payment, gatewayOrder] = await Promise.all([
    fetchGatewayPayment(razorpay_payment_id),
    fetchGatewayOrder(razorpay_order_id),
  ]);
  if (!payment.ok) return fail(payment.reason, payment.status);
  if (!gatewayOrder.ok) return fail(gatewayOrder.reason, gatewayOrder.status);

  if (payment.payment.status !== "captured") {
    return fail("The payment has not been captured, so the order has not been marked as paid.", 400);
  }
  if (payment.payment.orderId !== razorpay_order_id) {
    return fail("This payment does not belong to this order.", 400);
  }

  // The gateway's order carries the shop's own order id as its receipt.
  const shopOrderId = gatewayOrder.order.receipt;
  if (!shopOrderId) {
    return fail("We could not tell which order this payment belongs to.", 400);
  }

  const shopOrder = await getOrder(shopOrderId);
  if (!shopOrder) {
    return fail("We could not find the order this payment belongs to.", 400);
  }

  // The money has to be the money that was owed. The shop's own order
  // says what that is, in rupees; the gateway says what was paid, in
  // paise.
  const expected = Math.round(shopOrder.total * 100);
  if (payment.payment.amount !== expected) {
    return fail("The amount paid does not match the order, so it has not been accepted.", 400);
  }

  // An order that has already been paid for is not paid for twice. A
  // second payment is a second payment, and it is not swallowed here.
  if (shopOrder.payment_reference && shopOrder.payment_reference !== razorpay_payment_id) {
    return fail("This order has already been paid for.", 409);
  }

  // The payment is real, and it is the shop's order: write down what it
  // was, and how it was paid.
  const method = payment.payment.method || GATEWAY_NAME;
  await getDb()
    .prepare(
      `UPDATE orders
          SET payment_gateway = ?, payment_reference = ?, payment_method = ?
        WHERE id = ?`
    )
    .run(GATEWAY_NAME, razorpay_payment_id, method, shopOrderId);

  // Now the order is in, and the customer is told.
  await notifyOrderPlaced(shopOrderId);

  await clearCart();
  revalidatePath("/", "layout");

  return json({
    ok: true,
    order_id: shopOrderId,
    payment_id: razorpay_payment_id,
    method,
  });
}
