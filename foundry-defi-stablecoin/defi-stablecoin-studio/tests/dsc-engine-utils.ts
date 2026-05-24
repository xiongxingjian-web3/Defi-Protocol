import { newMockEvent } from "matchstick-as"
import { ethereum, Address, BigInt } from "@graphprotocol/graph-ts"
import {
  CollateralDeposited,
  CollateralRedeemed,
  DscBurned,
  DscMinted,
  Liquidated
} from "../generated/DSCEngine/DSCEngine"

export function createCollateralDepositedEvent(
  user: Address,
  token: Address,
  amount: BigInt
): CollateralDeposited {
  let collateralDepositedEvent = changetype<CollateralDeposited>(newMockEvent())

  collateralDepositedEvent.parameters = new Array()

  collateralDepositedEvent.parameters.push(
    new ethereum.EventParam("user", ethereum.Value.fromAddress(user))
  )
  collateralDepositedEvent.parameters.push(
    new ethereum.EventParam("token", ethereum.Value.fromAddress(token))
  )
  collateralDepositedEvent.parameters.push(
    new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(amount))
  )

  return collateralDepositedEvent
}

export function createCollateralRedeemedEvent(
  user: Address,
  token: Address,
  amount: BigInt
): CollateralRedeemed {
  let collateralRedeemedEvent = changetype<CollateralRedeemed>(newMockEvent())

  collateralRedeemedEvent.parameters = new Array()

  collateralRedeemedEvent.parameters.push(
    new ethereum.EventParam("user", ethereum.Value.fromAddress(user))
  )
  collateralRedeemedEvent.parameters.push(
    new ethereum.EventParam("token", ethereum.Value.fromAddress(token))
  )
  collateralRedeemedEvent.parameters.push(
    new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(amount))
  )

  return collateralRedeemedEvent
}

export function createDscBurnedEvent(user: Address, amount: BigInt): DscBurned {
  let dscBurnedEvent = changetype<DscBurned>(newMockEvent())

  dscBurnedEvent.parameters = new Array()

  dscBurnedEvent.parameters.push(
    new ethereum.EventParam("user", ethereum.Value.fromAddress(user))
  )
  dscBurnedEvent.parameters.push(
    new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(amount))
  )

  return dscBurnedEvent
}

export function createDscMintedEvent(user: Address, amount: BigInt): DscMinted {
  let dscMintedEvent = changetype<DscMinted>(newMockEvent())

  dscMintedEvent.parameters = new Array()

  dscMintedEvent.parameters.push(
    new ethereum.EventParam("user", ethereum.Value.fromAddress(user))
  )
  dscMintedEvent.parameters.push(
    new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(amount))
  )

  return dscMintedEvent
}

export function createLiquidatedEvent(
  user: Address,
  repayer: Address,
  amount: BigInt
): Liquidated {
  let liquidatedEvent = changetype<Liquidated>(newMockEvent())

  liquidatedEvent.parameters = new Array()

  liquidatedEvent.parameters.push(
    new ethereum.EventParam("user", ethereum.Value.fromAddress(user))
  )
  liquidatedEvent.parameters.push(
    new ethereum.EventParam("repayer", ethereum.Value.fromAddress(repayer))
  )
  liquidatedEvent.parameters.push(
    new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(amount))
  )

  return liquidatedEvent
}
