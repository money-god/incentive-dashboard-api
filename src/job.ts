import {
  bigNumberToNumber,
  coinGeckoPrice,
  auraApr,
  Document,
  DOCUMENT_KEY,
  DYNAMODB_TABLE,
  formatPercent,
  getUniV3ActiveLiquidity,
  getUniV3Positions,
  nFormatter,
} from "./utils";
import JSBI from 'jsbi'
import { BigNumber, ethers } from "ethers";
import { GebAdmin } from "@money-god/geb-admin";
import { utils } from "@money-god/geb-admin";
import { UniswapV3Pool } from "@money-god/geb-contract-api";
import { DynamoDB } from "aws-sdk";

import invariant from 'tiny-invariant'

const BLOCK_INTERVAL = 12;

const blockRateToYearlyRate = (blockRate: Number) =>
    blockRate * 7200 * 365;

const blockRateToDailyRate = (blockRate: Number) =>
    blockRate * 7200;

const MaxUint256 = JSBI.BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
const Q32 = JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(32))
const Q96 = JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(96))
const ZERO = JSBI.BigInt(0)
const ONE = JSBI.BigInt(1)
const MIN_TICK: number = -887272;
const MAX_TICK: number = -MIN_TICK;

function getAmount0Delta(sqrtRatioAX96: JSBI, sqrtRatioBX96: JSBI, liquidity: JSBI, roundUp: boolean): JSBI {
  if (JSBI.greaterThan(sqrtRatioAX96, sqrtRatioBX96)) {
    ;[sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96]
  }

  const numerator1 = JSBI.leftShift(liquidity, JSBI.BigInt(96))
  const numerator2 = JSBI.subtract(sqrtRatioBX96, sqrtRatioAX96)

  return roundUp
    ? mulDivRoundingUp(mulDivRoundingUp(numerator1, numerator2, sqrtRatioBX96), ONE, sqrtRatioAX96)
    : JSBI.divide(JSBI.divide(JSBI.multiply(numerator1, numerator2), sqrtRatioBX96), sqrtRatioAX96)
}

function getAmount1Delta(sqrtRatioAX96: JSBI, sqrtRatioBX96: JSBI, liquidity: JSBI, roundUp: boolean): JSBI {
  if (JSBI.greaterThan(sqrtRatioAX96, sqrtRatioBX96)) {
    ;[sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96]
  }

  return roundUp
    ? mulDivRoundingUp(liquidity, JSBI.subtract(sqrtRatioBX96, sqrtRatioAX96), Q96)
    : JSBI.divide(JSBI.multiply(liquidity, JSBI.subtract(sqrtRatioBX96, sqrtRatioAX96)), Q96)
}

function mulDivRoundingUp(a: JSBI, b: JSBI, denominator: JSBI): JSBI {
  const product = JSBI.multiply(a, b)
  let result = JSBI.divide(product, denominator)
  if (JSBI.notEqual(JSBI.remainder(product, denominator), ZERO)) result = JSBI.add(result, ONE)
  return result
}
function mulShift(val: JSBI, mulBy: string): JSBI {
  return JSBI.signedRightShift(JSBI.multiply(val, JSBI.BigInt(mulBy)), JSBI.BigInt(128))
}
function getSqrtRatioAtTick(tick: number): JSBI {
  invariant(tick >= MIN_TICK && tick <= MAX_TICK && Number.isInteger(tick), 'TICK')
  const absTick: number = tick < 0 ? tick * -1 : tick

  let ratio: JSBI =
    (absTick & 0x1) != 0
      ? JSBI.BigInt('0xfffcb933bd6fad37aa2d162d1a594001')
      : JSBI.BigInt('0x100000000000000000000000000000000')
  if ((absTick & 0x2) != 0) ratio = mulShift(ratio, '0xfff97272373d413259a46990580e213a')
  if ((absTick & 0x4) != 0) ratio = mulShift(ratio, '0xfff2e50f5f656932ef12357cf3c7fdcc')
  if ((absTick & 0x8) != 0) ratio = mulShift(ratio, '0xffe5caca7e10e4e61c3624eaa0941cd0')
  if ((absTick & 0x10) != 0) ratio = mulShift(ratio, '0xffcb9843d60f6159c9db58835c926644')
  if ((absTick & 0x20) != 0) ratio = mulShift(ratio, '0xff973b41fa98c081472e6896dfb254c0')
  if ((absTick & 0x40) != 0) ratio = mulShift(ratio, '0xff2ea16466c96a3843ec78b326b52861')
  if ((absTick & 0x80) != 0) ratio = mulShift(ratio, '0xfe5dee046a99a2a811c461f1969c3053')
  if ((absTick & 0x100) != 0) ratio = mulShift(ratio, '0xfcbe86c7900a88aedcffc83b479aa3a4')
  if ((absTick & 0x200) != 0) ratio = mulShift(ratio, '0xf987a7253ac413176f2b074cf7815e54')
  if ((absTick & 0x400) != 0) ratio = mulShift(ratio, '0xf3392b0822b70005940c7a398e4b70f3')
  if ((absTick & 0x800) != 0) ratio = mulShift(ratio, '0xe7159475a2c29b7443b29c7fa6e889d9')
  if ((absTick & 0x1000) != 0) ratio = mulShift(ratio, '0xd097f3bdfd2022b8845ad8f792aa5825')
  if ((absTick & 0x2000) != 0) ratio = mulShift(ratio, '0xa9f746462d870fdf8a65dc1f90e061e5')
  if ((absTick & 0x4000) != 0) ratio = mulShift(ratio, '0x70d869a156d2a1b890bb3df62baf32f7')
  if ((absTick & 0x8000) != 0) ratio = mulShift(ratio, '0x31be135f97d08fd981231505542fcfa6')
  if ((absTick & 0x10000) != 0) ratio = mulShift(ratio, '0x9aa508b5b7a84e1c677de54f3e99bc9')
  if ((absTick & 0x20000) != 0) ratio = mulShift(ratio, '0x5d6af8dedb81196699c329225ee604')
  if ((absTick & 0x40000) != 0) ratio = mulShift(ratio, '0x2216e584f5fa1ea926041bedfe98')
  if ((absTick & 0x80000) != 0) ratio = mulShift(ratio, '0x48a170391f7dc42444e8fa2')

  if (tick > 0) ratio = JSBI.divide(MaxUint256, ratio)

  // back to Q96
  return JSBI.greaterThan(JSBI.remainder(ratio, Q32), ZERO)
    ? JSBI.add(JSBI.divide(ratio, Q32), ONE)
    : JSBI.divide(ratio, Q32)
}

export const createDoc = async (): Promise<Document> => {
  const provider = new ethers.providers.StaticJsonRpcProvider(process.env.ETH_RPC);
  const gebAdmin = new GebAdmin("mainnet", provider);
  //const rawDoc = require("../distros_count.yml");
  const rawDoc = require("../distros.yml");
  const valuesMap = new Map<string, string>();
  //const rateUsd = 5
  const rateWethPool = new UniswapV3Pool('0x59262eeac376f4b29f21bfb375628f3312943338', gebAdmin.provider);

  // TAI/USD TWAP
  //const [taiUsd, valid] = await(gebAdmin.contracts.medianizerTai.getResultWithValidity());
  const taiUsdResult = await(gebAdmin.contracts.medianizerTai.getResultWithValidity());
  const marketPrice = bigNumberToNumber(taiUsdResult[0]) / 1e18; 

  // Circulating RATE supply
  const rewardsStart = 780000
  const lastMonthDistributed = bigNumberToNumber(await gebAdmin.contracts.protEmitter.lastMonthDistributed());
  const rewardsLeft = await(gebAdmin.contracts.protEmitter.startingSupplyMonths(lastMonthDistributed + 1)) / 1e18;
  const rewardsCirculating = rewardsStart - rewardsLeft;

  var teamStreams = [105236, 105237, 105238, 105240, 105380, 105379];
  var teamStreamsRequests = [];  
  for (var i = 0; i < teamStreams.length; i++) {
    var streamReq = gebAdmin.contracts.sablier.getStream(teamStreams[i], true)
    streamReq.to = gebAdmin.contracts.sablier.address
    teamStreamsRequests.push(streamReq)
    }

  const multicallStreams = gebAdmin.multiCall(teamStreamsRequests)
  const multiCallStreamsData = await Promise.all([
    multicallStreams
  ]);

  var teamStreamed = 0
  const now = Date.now()/1000
  for (var i = 0; i < multiCallStreamsData[0].length; i++) {
      var startTime =  bigNumberToNumber(multiCallStreamsData[0][i][4]);
      var stopTime =  bigNumberToNumber(multiCallStreamsData[0][i][5]);
      var perSecRate = bigNumberToNumber(multiCallStreamsData[0][i][7]);
      var elapsed = now - startTime;
      var streamed = elapsed * perSecRate;
      teamStreamed += streamed/1e18;
  }
  const rateCirculatingSupply = rewardsCirculating + teamStreamed

  // Mint APR
  const debtRewardsRequest = gebAdmin.contracts.debtRewards.rewardRate(true);
  const liqRewardsRequest = gebAdmin.contracts.liquidityRewards.rewardRate(true);
  const ethARequest = gebAdmin.contracts.oracleRelayer.collateralTypes(utils.ETH_A, true);
  const ethBRequest = gebAdmin.contracts.oracleRelayer.collateralTypes(utils.ETH_B, true);
  const ethCRequest = gebAdmin.contracts.oracleRelayer.collateralTypes(utils.ETH_C, true);
  const wstethARequest = gebAdmin.contracts.oracleRelayer.collateralTypes(utils.WSTETH_A, true);
  const wstethBRequest = gebAdmin.contracts.oracleRelayer.collateralTypes(utils.WSTETH_B, true);
  const rethARequest = gebAdmin.contracts.oracleRelayer.collateralTypes(utils.RETH_A, true);
  const rethBRequest = gebAdmin.contracts.oracleRelayer.collateralTypes(utils.RETH_B, true);
  const cbethARequest = gebAdmin.contracts.oracleRelayer.collateralTypes(utils.CBETH_A, true);
  const cbethBRequest = gebAdmin.contracts.oracleRelayer.collateralTypes(utils.CBETH_B, true);
  const raiARequest = gebAdmin.contracts.oracleRelayer.collateralTypes(utils.RAI_A, true);
  const woethARequest = gebAdmin.contracts.oracleRelayer.collateralTypes(utils.WOETH_A, true);

  debtRewardsRequest.to = gebAdmin.contracts.debtRewards.address
  liqRewardsRequest.to = gebAdmin.contracts.liquidityRewards.address
  ethARequest.to = gebAdmin.contracts.oracleRelayer.address
  ethBRequest.to = gebAdmin.contracts.oracleRelayer.address
  ethCRequest.to = gebAdmin.contracts.oracleRelayer.address
  wstethARequest.to = gebAdmin.contracts.oracleRelayer.address
  wstethBRequest.to = gebAdmin.contracts.oracleRelayer.address
  rethARequest.to = gebAdmin.contracts.oracleRelayer.address
  rethBRequest.to = gebAdmin.contracts.oracleRelayer.address
  cbethARequest.to = gebAdmin.contracts.oracleRelayer.address
  cbethBRequest.to = gebAdmin.contracts.oracleRelayer.address
  raiARequest.to = gebAdmin.contracts.oracleRelayer.address
  woethARequest.to = gebAdmin.contracts.oracleRelayer.address

  const ethADebtRequest = gebAdmin.contracts.safeEngine.collateralTypes(utils.ETH_A, true);
  const ethBDebtRequest = gebAdmin.contracts.safeEngine.collateralTypes(utils.ETH_B, true);
  const ethCDebtRequest = gebAdmin.contracts.safeEngine.collateralTypes(utils.ETH_C, true);
  const wstethADebtRequest = gebAdmin.contracts.safeEngine.collateralTypes(utils.WSTETH_A, true);
  const wstethBDebtRequest = gebAdmin.contracts.safeEngine.collateralTypes(utils.WSTETH_B, true);
  const rethADebtRequest = gebAdmin.contracts.safeEngine.collateralTypes(utils.RETH_A, true);
  const rethBDebtRequest = gebAdmin.contracts.safeEngine.collateralTypes(utils.RETH_B, true);
  const cbethADebtRequest = gebAdmin.contracts.safeEngine.collateralTypes(utils.CBETH_A, true);
  const cbethBDebtRequest = gebAdmin.contracts.safeEngine.collateralTypes(utils.CBETH_B, true);
  const raiADebtRequest = gebAdmin.contracts.safeEngine.collateralTypes(utils.RAI_A, true);
  const woethADebtRequest = gebAdmin.contracts.safeEngine.collateralTypes(utils.WOETH_A, true);

  ethADebtRequest.to = gebAdmin.contracts.safeEngine.address
  ethBDebtRequest.to = gebAdmin.contracts.safeEngine.address
  ethCDebtRequest.to = gebAdmin.contracts.safeEngine.address
  wstethADebtRequest.to = gebAdmin.contracts.safeEngine.address
  wstethBDebtRequest.to = gebAdmin.contracts.safeEngine.address
  rethADebtRequest.to = gebAdmin.contracts.safeEngine.address
  rethBDebtRequest.to = gebAdmin.contracts.safeEngine.address
  cbethADebtRequest.to = gebAdmin.contracts.safeEngine.address
  cbethBDebtRequest.to = gebAdmin.contracts.safeEngine.address
  raiADebtRequest.to = gebAdmin.contracts.safeEngine.address
  woethADebtRequest.to = gebAdmin.contracts.safeEngine.address

  const redemptionPrice = bigNumberToNumber(await gebAdmin.contracts.oracleRelayer.redemptionPrice_readOnly()) / 1e27;
  const redemptionRate = await gebAdmin.contracts.oracleRelayer.redemptionRate() / 1e27;
  const redemptionRateAnnual = (redemptionRate ** (86400 * 365)  - 1) * 100
  const globalDebt = bigNumberToNumber(await gebAdmin.contracts.safeEngine.globalDebt()) / 1e45;

  const v3RateSlotRequest = rateWethPool.slot0(true);
  v3RateSlotRequest.to = rateWethPool.address

  // @ts-ignore
  const multicall = gebAdmin.multiCall([
    ethARequest, // 0
    ethBRequest, // 1
    ethCRequest, // 2
    wstethARequest, // 3
    wstethBRequest, // 4
    rethARequest, // 5
    rethBRequest, // 6
    raiARequest, // 7
    debtRewardsRequest,  //8
    ethADebtRequest, //9
    ethBDebtRequest, //10
    ethCDebtRequest, //11
    wstethADebtRequest, //12
    wstethBDebtRequest, //13
    rethADebtRequest, //14
    rethBDebtRequest, //15
    raiADebtRequest, //16
    liqRewardsRequest, //17  
    cbethARequest, // 18
    cbethBRequest, // 19
    cbethADebtRequest, // 20
    cbethBDebtRequest, // 21
    v3RateSlotRequest, // 22
    woethARequest, // 23
    woethADebtRequest, // 24
  ]) as any[];

  // == Execute all promises ==
  const multiCallData = await Promise.all([
    multicall,
    coinGeckoPrice(["ethereum", "wrapped-steth", "rocket-pool-eth", "rai", "coinbase-wrapped-staked-eth", "wrapped-oeth"]),
    auraApr()
  ]);

  const ethPrice = multiCallData[1][0]  
  const wstethPrice = multiCallData[1][1]  
  const rethPrice = multiCallData[1][2]  
  const raiPrice = multiCallData[1][3]  
  const cbethPrice = multiCallData[1][4]  
  const woethPrice = multiCallData[1][5]  
  const aura = multiCallData[2]

  const ethALR = multiCallData[0][0].liquidationCRatio
  const ethBLR = multiCallData[0][1].liquidationCRatio
  const ethCLR = multiCallData[0][2].liquidationCRatio
  const wstethALR = multiCallData[0][3].liquidationCRatio
  const wstethBLR = multiCallData[0][4].liquidationCRatio
  const rethALR = multiCallData[0][5].liquidationCRatio
  const rethBLR = multiCallData[0][6].liquidationCRatio
  const raiALR = multiCallData[0][7].liquidationCRatio
  const cbethALR = multiCallData[0][18].liquidationCRatio
  const cbethBLR = multiCallData[0][19].liquidationCRatio
  const woethALR = multiCallData[0][23].liquidationCRatio

  // Use 2 * liq-ratio for APR calculations
  const ethACratio = 2 * ethALR/1e27 * 100
  const ethBCratio = 2 * ethBLR/1e27 * 100
  const ethCCratio = 2 * ethCLR/1e27 * 100
  const wstethACratio = 2 * wstethALR/1e27 * 100
  const wstethBCratio = 2 * wstethBLR/1e27 * 100 
  const rethACratio = 2 * rethALR/1e27 * 100
  const rethBCratio = 2 * rethBLR/1e27 * 100
  const raiACratio = 2 * raiALR/1e27 * 100
  const cbethACratio = 2 * cbethALR/1e27 * 100
  const cbethBCratio = 2 * cbethBLR/1e27 * 100
  const woethACratio = 2 * woethALR/1e27 * 100

  const debtRewardsRate = multiCallData[0][8]/1e18 // Rate per debt per block
  const liqRewardsRate = multiCallData[0][17]/1e18 // Rate per TAI per block

  const ethADebt = multiCallData[0][9].debtAmount/1e18
  const ethBDebt = multiCallData[0][10].debtAmount/1e18
  const ethCDebt = multiCallData[0][11].debtAmount/1e18
  const wstethADebt = multiCallData[0][12].debtAmount/1e18
  const wstethBDebt = multiCallData[0][13].debtAmount/1e18
  const rethADebt = multiCallData[0][14].debtAmount/1e18
  const rethBDebt = multiCallData[0][15].debtAmount/1e18
  const raiADebt = multiCallData[0][16].debtAmount/1e18
  const cbethADebt = multiCallData[0][20].debtAmount/1e18
  const cbethBDebt = multiCallData[0][21].debtAmount/1e18
  const v3RateSlot = multiCallData[0][22]  
  const woethADebt = multiCallData[0][24].debtAmount/1e18

  const sqrtPriceX96Rate = v3RateSlot.sqrtPriceX96
  const rateWethPrice = JSBI.BigInt(sqrtPriceX96Rate * (1e18)/(1e18)) ** 2 / JSBI.BigInt(2) ** (JSBI.BigInt(192));
  const rateUsd = rateWethPrice * ethPrice

  const ratePerDebtPerYear = blockRateToYearlyRate(debtRewardsRate)
  const ratePerDebtPerDay = blockRateToDailyRate(debtRewardsRate)
 
  // Amount of RATE emitted per day for each c-type at current debt levels
  const ethADailyRate = ethADebt * ratePerDebtPerDay  
  const ethBDailyRate = ethBDebt * ratePerDebtPerDay  
  const ethCDailyRate = ethCDebt * ratePerDebtPerDay  
  const wstethADailyRate = wstethADebt * ratePerDebtPerDay  
  const wstethBDailyRate = wstethBDebt * ratePerDebtPerDay  
  const rethADailyRate = rethADebt * ratePerDebtPerDay  
  const rethBDailyRate = rethBDebt * ratePerDebtPerDay  
  const raiADailyRate = raiADebt * ratePerDebtPerDay  
  const cbethADailyRate = cbethADebt * ratePerDebtPerDay  
  const cbethBDailyRate = cbethBDebt * ratePerDebtPerDay  
  const woethADailyRate = woethADebt * ratePerDebtPerDay  

  const totalMintDailyRate = ethADailyRate + ethBDailyRate + ethCDailyRate + wstethADailyRate + wstethBDailyRate + rethADailyRate  + rethBDailyRate  + raiADailyRate + cbethADailyRate + cbethBDailyRate + woethADailyRate;  

  // amount of debt at c-ratio = 2 * liq-ratio
  const ethADebtUsed =  ethPrice / (ethALR/1e27) / redemptionPrice
  const ethBDebtUsed =  ethPrice / (ethBLR/1e27) / redemptionPrice
  const ethCDebtUsed =  ethPrice / (ethCLR/1e27) / redemptionPrice
  const wstethADebtUsed =  wstethPrice / (wstethALR/1e27) / redemptionPrice
  const wstethBDebtUsed =  wstethPrice / (wstethBLR/1e27) / redemptionPrice
  const rethADebtUsed =  rethPrice / (rethALR/1e27) / redemptionPrice
  const rethBDebtUsed =  rethPrice / (rethBLR/1e27) / redemptionPrice
  const raiADebtUsed =  raiPrice / (raiALR/1e27) / redemptionPrice
  const cbethADebtUsed =  cbethPrice / (cbethALR/1e27) / redemptionPrice
  const cbethBDebtUsed =  cbethPrice / (cbethBLR/1e27) / redemptionPrice
  const woethADebtUsed =  woethPrice / (woethALR/1e27) / redemptionPrice

  // APRs for minting
  const ethAAPR = ethADebtUsed * ratePerDebtPerYear * rateUsd / ethPrice
  const ethBAPR = ethBDebtUsed * ratePerDebtPerYear * rateUsd / ethPrice
  const ethCAPR = ethCDebtUsed * ratePerDebtPerYear * rateUsd / ethPrice
  const wstethAAPR = wstethADebtUsed * ratePerDebtPerYear * rateUsd / wstethPrice
  const wstethBAPR = wstethBDebtUsed * ratePerDebtPerYear * rateUsd / wstethPrice
  const rethAAPR = rethADebtUsed * ratePerDebtPerYear * rateUsd / rethPrice
  const rethBAPR = rethBDebtUsed * ratePerDebtPerYear * rateUsd / rethPrice
  const raiAAPR = raiADebtUsed * ratePerDebtPerYear * rateUsd / raiPrice
  const cbethAAPR = cbethADebtUsed * ratePerDebtPerYear * rateUsd / cbethPrice
  const cbethBAPR = cbethBDebtUsed * ratePerDebtPerYear * rateUsd / cbethPrice
  const woethAAPR = woethADebtUsed * ratePerDebtPerYear * rateUsd / woethPrice

  // LP APR
  const [tickLower, tickUpper] = [-887220, 887220]
  const positionTypes = ['address','int24','int24']
  const positionValues = [gebAdmin.contracts.bunniHub.address, tickLower, tickUpper]
  const v3PoolRequest = gebAdmin.contracts.uniswapV3PairCoinEth.positions(ethers.utils.solidityKeccak256(positionTypes, positionValues), true);
  const v3SlotRequest = gebAdmin.contracts.uniswapV3PairCoinEth.slot0(true);
  const bunniTokenRequest = gebAdmin.contracts.bunniToken.totalSupply(true);

  v3PoolRequest.to = gebAdmin.contracts.uniswapV3PairCoinEth.address
  v3SlotRequest.to = gebAdmin.contracts.uniswapV3PairCoinEth.address
  bunniTokenRequest.to = gebAdmin.contracts.bunniToken.address 

  // @ts-ignore
  const multicall1 = gebAdmin.multiCall([
    v3PoolRequest, // 0
    v3SlotRequest, // 1
    bunniTokenRequest, // 2
  ]) as any[];

  // == Execute all promises ==
  const multiCallData1 = await Promise.all([
    multicall1,
  ]);
    
  const v3Pool = multiCallData1[0][0]  
  const v3Slot = multiCallData1[0][1]  
  const bunniTokenTotalSupply = multiCallData1[0][2]

  const existingLiquidity = v3Pool.liquidity; 
  const sqrtPriceX96 = v3Slot.sqrtPriceX96
  const removedLiquidityPerShare = mulDivRoundingUp(JSBI.BigInt(existingLiquidity), JSBI.BigInt(utils.WAD), JSBI.BigInt(bunniTokenTotalSupply));

  // WETH 
  const amount0 =  getAmount0Delta(JSBI.BigInt(sqrtPriceX96), getSqrtRatioAtTick(tickUpper), JSBI.BigInt(removedLiquidityPerShare))/utils.WAD
  // TAI
  const amount1 =  getAmount1Delta(getSqrtRatioAtTick(tickLower), JSBI.BigInt(sqrtPriceX96), JSBI.BigInt(removedLiquidityPerShare))/utils.WAD

  const ratePerLPPerYear = blockRateToYearlyRate(liqRewardsRate)
  const ratePerLPPerDay = blockRateToDailyRate(liqRewardsRate)

  const costBasis = amount0 * ethPrice + amount1 * redemptionPrice
  const returnAmount = rateUsd * ratePerLPPerDay * 365
  const lpAPR =  (returnAmount/costBasis * 100)

  const LPDailyRate = bunniTokenTotalSupply/1e18 * ratePerLPPerDay  

  // APR for LPing 
  const LPAPR = ratePerLPPerYear * rateUsd / redemptionPrice
  console.log(typeof marketPrice);
  console.log(typeof redemptionPrice);
  valuesMap.set("RATE_USD", nFormatter(rateUsd, 2));
  valuesMap.set("RATE_CIRCULATING_SUPPLY", rateCirculatingSupply);
  valuesMap.set("TAI_MARKET_PRICE", marketPrice.toFixed(6));
  valuesMap.set("TAI_REDEMPTION_PRICE", nFormatter(redemptionPrice, 6));
  valuesMap.set("TAI_REDEMPTION_RATE", redemptionRateAnnual.toFixed(2));
  valuesMap.set("AURA_APR", aura);
  valuesMap.set("ETH_A_CRATIO", Math.round(ethACratio));
  valuesMap.set("ETH_B_CRATIO", Math.round(ethBCratio));
  valuesMap.set("ETH_C_CRATIO", Math.round(ethCCratio));
  valuesMap.set("WSTETH_A_CRATIO", Math.round(wstethACratio));
  valuesMap.set("WSTETH_B_CRATIO", Math.round(wstethBCratio));
  valuesMap.set("RETH_A_CRATIO", Math.round(rethACratio));
  valuesMap.set("RETH_B_CRATIO", Math.round(rethBCratio));
  valuesMap.set("RAI_A_CRATIO", Math.round(raiACratio));
  valuesMap.set("CBETH_A_CRATIO", Math.round(cbethACratio));
  valuesMap.set("CBETH_B_CRATIO", Math.round(cbethBCratio));
  valuesMap.set("WOETH_A_CRATIO", Math.round(woethACratio));

  valuesMap.set("ETH_A_MINT_RATE_PER_DAY", nFormatter(ethADailyRate, 2));
  valuesMap.set("ETH_B_MINT_RATE_PER_DAY", nFormatter(ethBDailyRate, 2));
  valuesMap.set("ETH_C_MINT_RATE_PER_DAY", nFormatter(ethCDailyRate, 2));
  valuesMap.set("WSTETH_A_MINT_RATE_PER_DAY", nFormatter(wstethADailyRate, 2));
  valuesMap.set("WSTETH_B_MINT_RATE_PER_DAY", nFormatter(wstethBDailyRate, 2));
  valuesMap.set("RETH_A_MINT_RATE_PER_DAY", nFormatter(rethADailyRate, 2));
  valuesMap.set("RETH_B_MINT_RATE_PER_DAY", nFormatter(rethBDailyRate, 2));
  valuesMap.set("RAI_A_MINT_RATE_PER_DAY", nFormatter(raiADailyRate, 2));
  valuesMap.set("CBETH_A_MINT_RATE_PER_DAY", nFormatter(cbethADailyRate, 2));
  valuesMap.set("CBETH_B_MINT_RATE_PER_DAY", nFormatter(cbethBDailyRate, 2));
  valuesMap.set("WOETH_A_MINT_RATE_PER_DAY", nFormatter(woethADailyRate, 2));
  valuesMap.set("TOTAL_MINT_RATE_PER_DAY", Math.round(totalMintDailyRate));

  valuesMap.set("ETH_A_MINT_APR", nFormatter(formatPercent(ethAAPR * 100),  2));
  valuesMap.set("ETH_B_MINT_APR", nFormatter(formatPercent(ethBAPR * 100),  2));
  valuesMap.set("ETH_C_MINT_APR", nFormatter(formatPercent(ethCAPR * 100),  2));
  valuesMap.set("WSTETH_A_MINT_APR", nFormatter(formatPercent(wstethAAPR * 100),  2));
  valuesMap.set("WSTETH_B_MINT_APR", nFormatter(formatPercent(wstethBAPR * 100),  2));
  valuesMap.set("RETH_A_MINT_APR", nFormatter(formatPercent(rethAAPR * 100),  2));
  valuesMap.set("RETH_B_MINT_APR", nFormatter(formatPercent(rethBAPR * 100),  2));
  valuesMap.set("RAI_A_MINT_APR", nFormatter(formatPercent(raiAAPR * 100),  2));
  valuesMap.set("CBETH_A_MINT_APR", nFormatter(formatPercent(cbethAAPR * 100),  2));
  valuesMap.set("CBETH_B_MINT_APR", nFormatter(formatPercent(cbethBAPR * 100),  2));
  valuesMap.set("WOETH_A_MINT_APR", nFormatter(formatPercent(woethAAPR * 100),  2));

  valuesMap.set("LP_RATE_PER_DAY", Math.round(LPDailyRate));
  valuesMap.set("LP_APR", nFormatter(formatPercent(lpAPR),  2));

  valuesMap.set("TAI_ICON", "https://ipfs.io/ipfs/QmYUysarFEGha5neVCmShtMBcpNqtgjYfauwhuot1Zk9i3?filename=tai.png")

  setPropertyRecursive(rawDoc, valuesMap);
  // == Store in DynamoDB
  const params = {
    TableName: DYNAMODB_TABLE as string,
    Item: {
      id: DOCUMENT_KEY,
      data: rawDoc,
    },
  };

  try {
    const dynamoDb = new DynamoDB.DocumentClient();
    await dynamoDb.put(params).promise();
  } catch (err) {
    console.log("Could not store in DynamoDB");
    console.log(err.message);
  }

  return rawDoc as any;
};

const setPropertyRecursive = (obj: any, map: Map<string, string>) => {
  for (let k of Object.keys(obj)) {
    switch (typeof obj[k]) {
      case "object":
        setPropertyRecursive(obj[k], map);
        break;
      case "string":
        const matches = obj[k].match(/{{(.*?)}}/g);
        if (!matches) continue;
        for (let m of matches) {
          const key = m.replace("{{", "").replace("}}", "");
          if (map.has(key)) {
            obj[k] = obj[k].replace(m, map.get(key));
          }
        }
        break;
      default:
        continue;
    }
  }
};
