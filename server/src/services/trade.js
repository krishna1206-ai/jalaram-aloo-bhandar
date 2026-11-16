import { cityByName, productByKey } from "../catalog.js";
import { withTransaction } from "../db.js";
import { badRequest } from "../errors.js";
import { MAX_BAGS, quote, toPaise } from "../money.js";
import { Holding, Order, Rate, Transaction, User, newOrderId, newTxnId } from "../models/index.js";
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

  return withTransaction(async (session) => {
    // Always trade at the server's current rate, never a price sent by the browser
    const rate = await Rate.findOne({ product: product.key, city: city.name }, { today: 1 }).session(session);
    if (!rate) throw badRequest("No rate is available for this mandi right now.");
    const ratePaise = toPaise(rate.today);
    const bill = quote(ratePaise, bags);
    const holding = await Holding.findOne({ user: user._id, product: product.key, city: city.name }).session(session);
    const label = `${bags} ${bags === 1 ? "bag" : "bags"} ${product.name.toLowerCase()} · ${city.name}`;

    let walletChange;
    if (side === "Buy") {
      const paid = await User.updateOne(
        { _id: user._id, availablePaise: { $gte: bill.total } },
        { $inc: { availablePaise: -bill.total } },
        { session }
      );
      if (!paid.modifiedCount) throw badRequest("Not enough money in your wallet.", { bags: "Not enough money." });

      const oldBags = holding?.bags ?? 0;
      const oldAvg = holding?.avgCostPaise ?? 0;
      const totalBags = oldBags + bags;
      await Holding.updateOne(
        { user: user._id, product: product.key, city: city.name },
        { bags: totalBags, avgCostPaise: Math.round((oldBags * oldAvg + bags * ratePaise) / totalBags) },
        { upsert: true, session }
      );
      walletChange = -bill.total;
    } else {
      if (!holding || holding.bags < bags) {
        throw badRequest(`You hold only ${holding?.bags ?? 0} bags of ${product.name.toLowerCase()} in ${city.name}.`, { bags: "Too many." });
      }
      const proceeds = bill.value - bill.charges;
      if (proceeds <= 0) throw badRequest("This order is too small to cover the charges.", { bags: "Too small." });
      const left = holding.bags - bags;
      if (left === 0) await Holding.deleteOne({ _id: holding._id }, { session });
      else await Holding.updateOne({ _id: holding._id, bags: holding.bags }, { bags: left }, { session });
      await User.updateOne({ _id: user._id }, { $inc: { availablePaise: proceeds } }, { session });
      walletChange = proceeds;
    }

    const [order] = await Order.create(
      [{
        orderId: await newOrderId(session),
        user: user._id,
        side,
        product: product.key,
        city: city.name,
        bags,
        ratePaise,
        chargesPaise: bill.charges,
        totalPaise: Math.abs(walletChange),
      }],
      { session }
    );
    await Transaction.create(
      [{
        txnId: await newTxnId(session),
        user: user._id,
        type: side === "Buy" ? "Bought" : "Sold",
        desc: label,
        amountPaise: walletChange,
        order: order._id,
      }],
      { session }
    );
    return { order, bill };
  });
}
