import { cityByName, productByKey } from "../catalog.js";
import { withTransaction } from "../db.js";
import { badRequest } from "../errors.js";
import { MAX_BAGS, quote, toPaise } from "../money.js";
import { insertRow, newOrderId, newTxnId } from "../records.js";
import { assertCanTransact, verifyPin } from "./security.js";

export async function placeOrder(user, body) {
  assertCanTransact(user);

  const side = body.side === "Sell" ? "Sell" : body.side === "Buy" || body.side === undefined ? "Buy" : null;
  const product = productByKey(body.product);
  const city = cityByName(body.city);
  const bags = Number(body.bags);
  if (!side) throw badRequest("side must be Buy or Sell.");
  if (!product) throw badRequest("Unknown product.", { product: "Unknown." });
  if (!city) throw badRequest("Unknown city.", { city: "Unknown." });
  if (!Number.isInteger(bags) || bags < 1 || bags > MAX_BAGS) {
    throw badRequest(`Choose between 1 and ${MAX_BAGS} bags.`, { bags: "Out of range." });
  }

  await verifyPin(user, body.pin);

  return withTransaction(async (tx) => {
    // Always trade at the server's current rate, never a price sent by the browser
    const { rows } = await tx.query("SELECT today FROM rates WHERE product = $1 AND city = $2", [product.key, city.name]);
    if (!rows[0]) throw badRequest("No rate is available for this mandi right now.");
    const ratePaise = toPaise(rows[0].today);
    const bill = quote(ratePaise, bags);
    const label = `${bags} ${bags === 1 ? "bag" : "bags"} ${product.name.toLowerCase()} · ${city.name}`;

    let walletChange;
    if (side === "Buy") {
      const paid = await tx.query(
        "UPDATE users SET available_paise = available_paise - $2 WHERE id = $1 AND available_paise >= $2",
        [user.id, bill.total]
      );
      if (!paid.rowCount) throw badRequest("Not enough money in your wallet.", { bags: "Not enough money." });
      // Add bags and recalculate the average buy rate in one atomic statement
      await tx.query(
        `INSERT INTO holdings (user_id, product, city, bags, avg_cost_paise) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, product, city) DO UPDATE SET
           avg_cost_paise = ROUND((holdings.bags * holdings.avg_cost_paise + EXCLUDED.bags * EXCLUDED.avg_cost_paise)::numeric
                                  / (holdings.bags + EXCLUDED.bags)),
           bags = holdings.bags + EXCLUDED.bags,
           updated_at = now()`,
        [user.id, product.key, city.name, bags, ratePaise]
      );
      walletChange = -bill.total;
    } else {
      const proceeds = bill.value - bill.charges;
      if (proceeds <= 0) throw badRequest("This order is too small to cover the charges.", { bags: "Too small." });
      const sold = await tx.query(
        `UPDATE holdings SET bags = bags - $4, updated_at = now()
         WHERE user_id = $1 AND product = $2 AND city = $3 AND bags >= $4 RETURNING bags`,
        [user.id, product.key, city.name, bags]
      );
      if (!sold.rowCount) {
        const have = await tx.query("SELECT bags FROM holdings WHERE user_id = $1 AND product = $2 AND city = $3", [user.id, product.key, city.name]);
        throw badRequest(`You hold only ${have.rows[0]?.bags ?? 0} bags of ${product.name.toLowerCase()} in ${city.name}.`, { bags: "Too many." });
      }
      if (sold.rows[0].bags === 0) {
        await tx.query("DELETE FROM holdings WHERE user_id = $1 AND product = $2 AND city = $3 AND bags = 0", [user.id, product.key, city.name]);
      }
      await tx.query("UPDATE users SET available_paise = available_paise + $2 WHERE id = $1", [user.id, proceeds]);
      walletChange = proceeds;
    }

    const order = await insertRow(tx, "orders", {
      order_id: await newOrderId(tx),
      user_id: user.id,
      side,
      product: product.key,
      city: city.name,
      bags,
      rate_paise: ratePaise,
      charges_paise: bill.charges,
      total_paise: Math.abs(walletChange),
    });
    await insertRow(tx, "transactions", {
      txn_id: await newTxnId(tx),
      user_id: user.id,
      type: side === "Buy" ? "Bought" : "Sold",
      descr: label,
      amount_paise: walletChange,
      order_ref: order.id,
    });
    return { order, bill };
  });
}
