import {
  bigNumberToNumber,
  coinGeckoPrice,
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
  const gebAdmin = new GebAdmin("goerli", provider);
  const rawDoc = require("../distros.yml");
  const valuesMap = new Map<string, string>();
  const rateUsd = 5

  /*
   * 
   * Mint APR 
   * 
   */

  const debtRewardsRequest = gebAdmin.contracts.debtRewards.rewardRate(true);
  const liqRewardsRequest = gebAdmin.contracts.liquidityRewards.rewardRate(true);

  const ethARequest = gebAdmin.contracts.oracleRelayer.collateralTypes(utils.ETH_A, true);
  const ethBRequest = gebAdmin.contracts.oracleRelayer.collateralTypes(utils.ETH_B, true);
  const ethCRequest = gebAdmin.contracts.oracleRelayer.collateralTypes(utils.ETH_C, true);
  const wstethARequest = gebAdmin.contracts.oracleRelayer.collateralTypes(utils.WSTETH_A, true);
  const wstethBRequest = gebAdmin.contracts.oracleRelayer.collateralTypes(utils.WSTETH_B, true);
  const rethARequest = gebAdmin.contracts.oracleRelayer.collateralTypes(utils.RETH_A, true);
  const rethBRequest = gebAdmin.contracts.oracleRelayer.collateralTypes(utils.RETH_B, true);
  const raiARequest = gebAdmin.contracts.oracleRelayer.collateralTypes(utils.RAI_A, true);

  debtRewardsRequest.to = gebAdmin.contracts.debtRewards.address
  liqRewardsRequest.to = gebAdmin.contracts.liquidityRewards.address
  ethARequest.to = gebAdmin.contracts.oracleRelayer.address
  ethBRequest.to = gebAdmin.contracts.oracleRelayer.address
  ethCRequest.to = gebAdmin.contracts.oracleRelayer.address
  wstethARequest.to = gebAdmin.contracts.oracleRelayer.address
  wstethBRequest.to = gebAdmin.contracts.oracleRelayer.address
  rethARequest.to = gebAdmin.contracts.oracleRelayer.address
  rethBRequest.to = gebAdmin.contracts.oracleRelayer.address
  raiARequest.to = gebAdmin.contracts.oracleRelayer.address

  const ethADebtRequest = gebAdmin.contracts.safeEngine.collateralTypes(utils.ETH_A, true);
  const ethBDebtRequest = gebAdmin.contracts.safeEngine.collateralTypes(utils.ETH_B, true);
  const ethCDebtRequest = gebAdmin.contracts.safeEngine.collateralTypes(utils.ETH_C, true);
  const wstethADebtRequest = gebAdmin.contracts.safeEngine.collateralTypes(utils.WSTETH_A, true);
  const wstethBDebtRequest = gebAdmin.contracts.safeEngine.collateralTypes(utils.WSTETH_B, true);
  const rethADebtRequest = gebAdmin.contracts.safeEngine.collateralTypes(utils.RETH_A, true);
  const rethBDebtRequest = gebAdmin.contracts.safeEngine.collateralTypes(utils.RETH_B, true);
  const raiADebtRequest = gebAdmin.contracts.safeEngine.collateralTypes(utils.RAI_A, true);

  ethADebtRequest.to = gebAdmin.contracts.safeEngine.address
  ethBDebtRequest.to = gebAdmin.contracts.safeEngine.address
  ethCDebtRequest.to = gebAdmin.contracts.safeEngine.address
  wstethADebtRequest.to = gebAdmin.contracts.safeEngine.address
  wstethBDebtRequest.to = gebAdmin.contracts.safeEngine.address
  rethADebtRequest.to = gebAdmin.contracts.safeEngine.address
  rethBDebtRequest.to = gebAdmin.contracts.safeEngine.address
  raiADebtRequest.to = gebAdmin.contracts.safeEngine.address

  const redemptionPrice = bigNumberToNumber(await gebAdmin.contracts.oracleRelayer.redemptionPrice_readOnly()) / 1e27;
  const globalDebt = bigNumberToNumber(await gebAdmin.contracts.safeEngine.globalDebt()) / 1e45;

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
  ]) as any[];

  // == Execute all promises ==
  const multiCallData = await Promise.all([
    multicall,
    coinGeckoPrice(["ethereum", "wrapped-steth", "rocket-pool-eth", "rai"])
  ]);

  const ethPrice = multiCallData[1][0]  
  const wstethPrice = multiCallData[1][1]  
  const rethPrice = multiCallData[1][2]  
  const raiPrice = multiCallData[1][3]  

  const ethALR = multiCallData[0][0].liquidationCRatio
  const ethBLR = multiCallData[0][1].liquidationCRatio
  const ethCLR = multiCallData[0][2].liquidationCRatio
  const wstethALR = multiCallData[0][3].liquidationCRatio
  const wstethBLR = multiCallData[0][4].liquidationCRatio
  const rethALR = multiCallData[0][5].liquidationCRatio
  const rethBLR = multiCallData[0][6].liquidationCRatio
  const raiALR = multiCallData[0][7].liquidationCRatio

  // Use 2 * liq-ratio for APR calculations
  const ethACratio = 2 * ethALR/1e27 * 100
  const ethBCratio = 2 * ethBLR/1e27 * 100
  const ethCCratio = 2 * ethCLR/1e27 * 100
  const wstethACratio = 2 * wstethALR/1e27 * 100
  const wstethBCratio = 2 * wstethBLR/1e27 * 100 
  const rethACratio = 2 * rethALR/1e27 * 100
  const rethBCratio = 2 * rethBLR/1e27 * 100
  const raiACratio = 2 * raiALR/1e27 * 100

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

  // amount of debt at c-ratio = 2 * liq-ratio
  const ethADebtUsed =  ethPrice / (ethALR/1e27) / redemptionPrice
  const ethBDebtUsed =  ethPrice / (ethBLR/1e27) / redemptionPrice
  const ethCDebtUsed =  ethPrice / (ethCLR/1e27) / redemptionPrice
  const wstethADebtUsed =  wstethPrice / (wstethALR/1e27) / redemptionPrice
  const wstethBDebtUsed =  wstethPrice / (wstethBLR/1e27) / redemptionPrice
  const rethADebtUsed =  rethPrice / (rethALR/1e27) / redemptionPrice
  const rethBDebtUsed =  rethPrice / (rethBLR/1e27) / redemptionPrice
  const raiADebtUsed =  raiPrice / (raiALR/1e27) / redemptionPrice

  // APRs for minting
  const ethAAPR = ethADebtUsed * ratePerDebtPerYear * rateUsd / ethPrice
  const ethBAPR = ethBDebtUsed * ratePerDebtPerYear * rateUsd / ethPrice
  const ethCAPR = ethCDebtUsed * ratePerDebtPerYear * rateUsd / ethPrice
  const wstethAAPR = wstethADebtUsed * ratePerDebtPerYear * rateUsd / wstethPrice
  const wstethBAPR = wstethBDebtUsed * ratePerDebtPerYear * rateUsd / wstethPrice
  const rethAAPR = rethADebtUsed * ratePerDebtPerYear * rateUsd / rethPrice
  const rethBAPR = rethBDebtUsed * ratePerDebtPerYear * rateUsd / rethPrice
  const raiAAPR = raiADebtUsed * ratePerDebtPerYear * rateUsd / raiPrice

  /*
   * 
   * LP APR 
   * 
   */
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
  //const returnAmount = rateUsd * liqRewardsRate/1e18 * 7200 * 365
  const returnAmount = rateUsd * ratePerLPPerDay * 365
  const lpAPR =  (returnAmount/costBasis * 100)

  const LPDailyRate = bunniTokenTotalSupply/1e18 * ratePerLPPerDay  

  // APR for LPing 
  const LPAPR = ratePerLPPerYear * rateUsd / redemptionPrice

  valuesMap.set("RATE_USD", rateUsd);
  valuesMap.set("ETH_A_CRATIO", ethACratio);
  valuesMap.set("ETH_B_CRATIO", ethBCratio);
  valuesMap.set("ETH_C_CRATIO", ethCCratio);
  valuesMap.set("WSTETH_A_CRATIO", wstethACratio);
  valuesMap.set("WSTETH_B_CRATIO", wstethBCratio);
  valuesMap.set("RETH_A_CRATIO", rethACratio);
  valuesMap.set("RETH_B_CRATIO", rethBCratio);
  valuesMap.set("RAI_A_CRATIO", raiACratio);

  valuesMap.set("ETH_A_MINT_RATE_PER_DAY", nFormatter(ethADailyRate, 2));
  valuesMap.set("ETH_B_MINT_RATE_PER_DAY", nFormatter(ethBDailyRate, 2));
  valuesMap.set("ETH_C_MINT_RATE_PER_DAY", nFormatter(ethCDailyRate, 2));
  valuesMap.set("WSTETH_A_MINT_RATE_PER_DAY", nFormatter(wstethADailyRate, 2));
  valuesMap.set("WSTETH_B_MINT_RATE_PER_DAY", nFormatter(wstethBDailyRate, 2));
  valuesMap.set("RETH_A_MINT_RATE_PER_DAY", nFormatter(rethADailyRate, 2));
  valuesMap.set("RETH_B_MINT_RATE_PER_DAY", nFormatter(rethBDailyRate, 2));
  valuesMap.set("RAI_A_MINT_RATE_PER_DAY", nFormatter(raiADailyRate, 2));

  valuesMap.set("ETH_A_MINT_APR", nFormatter(formatPercent(ethAAPR * 100),  2));
  valuesMap.set("ETH_B_MINT_APR", nFormatter(formatPercent(ethBAPR * 100),  2));
  valuesMap.set("ETH_C_MINT_APR", nFormatter(formatPercent(ethCAPR * 100),  2));
  valuesMap.set("WSTETH_A_MINT_APR", nFormatter(formatPercent(wstethAAPR * 100),  2));
  valuesMap.set("WSTETH_B_MINT_APR", nFormatter(formatPercent(wstethBAPR * 100),  2));
  valuesMap.set("RETH_A_MINT_APR", nFormatter(formatPercent(rethAAPR * 100),  2));
  valuesMap.set("RETH_B_MINT_APR", nFormatter(formatPercent(rethBAPR * 100),  2));
  valuesMap.set("RAI_A_MINT_APR", nFormatter(formatPercent(raiAAPR * 100),  2));

  valuesMap.set("LP_RATE_PER_DAY", nFormatter(LPDailyRate, 2));
  valuesMap.set("LP_APR", nFormatter(formatPercent(lpAPR),  2));


  valuesMap.set("TAI_ICON", "data:image/png;base64,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")

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
