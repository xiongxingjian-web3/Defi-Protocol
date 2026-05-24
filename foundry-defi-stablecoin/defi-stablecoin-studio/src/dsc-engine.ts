import {
  CollateralDeposited as CollateralDepositedEvent,
  CollateralRedeemed as CollateralRedeemedEvent,
  DscMinted as DscMintedEvent,
  DscBurned as DscBurnedEvent,
  Liquidated as LiquidatedEvent,
} from "../generated/DSCEngine/DSCEngine";
import {
  CollateralDeposited,
  CollateralRedeemed,
  DscMinted,
  DscBurned,
  Liquidated,
  User,
  CollateralBalance,
} from "../generated/schema";
import { BigInt, Bytes } from "@graphprotocol/graph-ts";

// 辅助：获取或创建 User
function getOrCreateUser(address: Bytes): User {
  let id = address.toHexString();
  let user = User.load(id);
  if (user == null) {
    user = new User(id);
    user.totalDscMinted = BigInt.fromI32(0);
    user.save();
  }
  return user;
}

// 辅助：获取或创建 CollateralBalance
function getOrCreateCollateralBalance(
  userId: string,
  token: Bytes,
): CollateralBalance {
  let id = userId + "-" + token.toHexString();
  let balance = CollateralBalance.load(id);
  if (balance == null) {
    balance = new CollateralBalance(id);
    balance.user = userId;
    balance.token = token;
    balance.amount = BigInt.fromI32(0);
  }
  return balance;
}

export function handleCollateralDeposited(
  event: CollateralDepositedEvent,
): void {
  let user = getOrCreateUser(event.params.user);
  let balance = getOrCreateCollateralBalance(user.id, event.params.token);
  balance.amount = balance.amount.plus(event.params.amount);
  balance.save();
  user.save();

  let entity = new CollateralDeposited(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString(),
  );
  entity.user = event.params.user;
  entity.token = event.params.token;
  entity.amount = event.params.amount;
  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.save();
}

export function handleCollateralRedeemed(event: CollateralRedeemedEvent): void {
  let user = getOrCreateUser(event.params.user);
  let balance = getOrCreateCollateralBalance(user.id, event.params.token);
  balance.amount = balance.amount.minus(event.params.amount);
  if (balance.amount < BigInt.fromI32(0)) {
    balance.amount = BigInt.fromI32(0);
  }
  balance.save();
  user.save();

  let entity = new CollateralRedeemed(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString(),
  );
  entity.user = event.params.user;
  entity.token = event.params.token;
  entity.amount = event.params.amount;
  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.save();
}

export function handleDscMinted(event: DscMintedEvent): void {
  let user = getOrCreateUser(event.params.user);
  user.totalDscMinted = user.totalDscMinted.plus(event.params.amount);
  user.save();

  let entity = new DscMinted(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString(),
  );
  entity.user = event.params.user;
  entity.amount = event.params.amount;
  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.save();
}

export function handleDscBurned(event: DscBurnedEvent): void {
  let user = getOrCreateUser(event.params.user);
  user.totalDscMinted = user.totalDscMinted.minus(event.params.amount);
  if (user.totalDscMinted < BigInt.fromI32(0)) {
    user.totalDscMinted = BigInt.fromI32(0);
  }
  user.save();

  let entity = new DscBurned(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString(),
  );
  entity.user = event.params.user;
  entity.amount = event.params.amount;
  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.save();
}

export function handleLiquidated(event: LiquidatedEvent): void {
  let entity = new Liquidated(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString(),
  );
  entity.user = event.params.user;
  entity.repayer = event.params.repayer;
  entity.amount = event.params.amount;
  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.save();
}
