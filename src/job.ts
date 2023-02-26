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
import { BigNumber, ethers } from "ethers";
import { GebAdmin } from "@money-god/geb-admin";
import { DynamoDB } from "aws-sdk";

const BLOCK_INTERVAL = 13;

export const createDoc = async (): Promise<Document> => {
  const provider = new ethers.providers.StaticJsonRpcProvider(process.env.ETH_RPC);
  const geb = new GebAdmin("mainnet", provider);
  const rawDoc = require("../distros.yml");
  const valuesMap = new Map<string, string>();

  // == Blockchain multicall ==
  /*

  // Uniswap
  const flxEthReservesRequest = geb.contracts.uniswapPairCoinEth.getReserves(true);
  flxEthReservesRequest.to = "0xd6F3768E62Ef92a9798E5A8cEdD2b78907cEceF9"; // uni-v2 eth flx

  const flxEthLpTotalSupplyRequest = geb.contracts.uniswapPairCoinEth.totalSupply(true);
  flxEthLpTotalSupplyRequest.to = "0xd6F3768E62Ef92a9798E5A8cEdD2b78907cEceF9"; // uni-v2 eth flx


  // Uni V3 RAI/DAI
  const uniV3Slot0Request = geb.contracts.uniswapV3PairCoinEth.slot0(true);
  uniV3Slot0Request.to = "0xcB0C5d9D92f4F2F80cce7aa271a1E148c226e19D";

  // @ts-ignore
  const multicall = geb.multiCall([
    // uniswap
    geb.contracts.uniswapPairCoinEth.getReserves(true), // 0
    flxEthReservesRequest, // 1

    // Aave
    aaveVariableDebtRequest, // 2
    aaveRaiAssetData, // 3

    // Idle
    idleAPRRequest, // 4
    idleRaiTotalSupplyRequest, // 5
    idleTokenPriceRequest, // 6

    // Fuse
    fuseTotalBorrowRequest, // 7
    fuseBorrowRateRequest, // 8
    fuseSupplyRateRequest, // 9

    // FLX staking
    geb.contracts.stakingFirstResort.rewardRate(true), // 10
    geb.contracts.stakingToken.totalSupply(true), // 11
    flxEthLpTotalSupplyRequest, // 12
    geb.contracts.stakingFirstResort.stakedSupply(true), // 13

    // Uni V3 RAI/DAI
    uniV3Slot0Request, // 14
  ]) as any[];

  const redemptionPrice =
    bigNumberToNumber(await geb.contracts.oracleRelayer.redemptionPrice_readOnly()) / 1e27;

  // == Execute all prmoises ==
  const [[raiPrice, flxPrice], multiCallData] = await Promise.all([
    coinGeckoPrice(["rai", "reflexer-ungovernance-token"]),
    multicall,
  ]);
  */

  // == Populate map ==
  valuesMap.set("ETH_A_MINT_APR", nFormatter(10,  2));
  valuesMap.set("ETH_B_MINT_APR", nFormatter(10,  2));
  valuesMap.set("ETH_C_MINT_APR", nFormatter(10,  2));
  valuesMap.set("WSTETH_A_MINT_APR", nFormatter(10,  2));
  valuesMap.set("WSTETH_B_MINT_APR", nFormatter(10,  2));
  valuesMap.set("RETH_A_MINT_APR", nFormatter(10,  2));
  valuesMap.set("RETH_B_MINT_APR", nFormatter(10,  2));
  valuesMap.set("RAI_A_MINT_APR", nFormatter(10,  2));

  valuesMap.set("ETH_A_LP_APR", nFormatter(10,  2));
  valuesMap.set("ETH_B_LP_APR", nFormatter(10,  2));
  valuesMap.set("ETH_C_LP_APR", nFormatter(10,  2));
  valuesMap.set("WSTETH_A_LP_APR", nFormatter(10,  2));
  valuesMap.set("WSTETH_B_LP_APR", nFormatter(10,  2));
  valuesMap.set("RETH_A_LP_APR", nFormatter(10,  2));
  valuesMap.set("RETH_B_LP_APR", nFormatter(10,  2));
  valuesMap.set("RAI_A_LP_APR", nFormatter(10,  2));

  valuesMap.set("TAI_ICON", "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAXoAAAG4CAYAAABLgCwvAAAbRElEQVR4Ae3dbZbbOJJG4d7W/OgFzjJmV72NWUHOyapKTzotiYQIAvHx+Jw+tkUIjLjx4oqdVd3614dfCCCAAAKlCfyrdHeaQwABBBD4IHohQAABBIoTIPriA9YeAgggQPQygAACCBQnQPTFB6w9BBBAgOhlAAEEEChOgOiLD1h7CCCAANHLAAIIIFCcANEXH7D2EEAAAaKXAQQQQKA4AaIvPmDtIYAAAkQvAwgggEBxAkRffMDaQwABBIheBhBAAIHiBIi++IC1hwACCBC9DCCAAALFCRB98QFrDwEEECB6GUAAAQSKEyD64gPWHgIIIED0MoAAAggUJ0D0xQesPQQQQIDoZQABBBAoToDoiw9YewgggADRywACCCBQnADRFx+w9hBAAAGilwEEEECgOAGiLz5g7SGAAAJELwMIIIBAcQJEX3zA2kMAAQSIXgYQQACB4gRSif5//+e/PvwnBoPi50J7CJQikEL05B5D7uawfw6l7KOZZQTCi55c9svFDMygcwaW2fjGG4UWfedw6Z1cZSB+Bm5089Stw4peyOOH3IzMSAb+zsBUK9+wGdH7B7z+AbcMyMCEDNzg52lbhhS9pwRPijIgAxkzMM3Mkzci+gmf5BkDqWYilYH5GZjs52nbET3R+6/tMiADEzMwzc4TNyL6iQP2hDT/CQlTTLNlYKKfp21F9ETvaU4GZGByBqYZetJGRD95wNmePtTriVkG5mdgkp+nbRNO9EI3P3SYYioDazMwzdCTNiJ6T/T+a7sMyMDkDEzy87RtiH7ygD05rX1ywhvviBmYZuhJGxE90XuakwEZmJyBSX6etg3RTx5wxKcLNXnqlYG1GZhm6EkbET3Re5qTARmYnIFJfp62DdFPHrAnp7VPTnjjHTED0ww9aSOiJ3pPczIgA5MzMMnP07Yh+skDjvh0oSZPvTKwNgPTDD1pI6Inek9zMiADkzMwyc/TtiH6yQP25LT2yQlvvCNmYJqhJ21E9ETvaU4GZGByBib5edo2RD95wBGfLtTkqVcG1mZgmqEnbRRO9J99CeXaUOKNtwzMzcAkP0/bhug90ftglQEZmJyBaYaetBHRTx6wJ6O5T0Z44pkxA5P8PG2bkKL/7C7jcNVMSjIgA58ZiPaL6D3R+1CVARmYnAGiHyDg6cjTkQzIQMYMDGhuydKwT/Tfu884aDUTlAz0zcB3f0X4cwrRf4JyaPoeGrM3+2wZiCD37zWkEf33or//OVsA1EtaMlA/A98dFeHP6UV/B0QHsf5BNGMzvjMDd3jpyp5Ef4Xe4HvvDJa9iUsG4mRgUA23Lyf62xHffwMHPM4BNwuz+MxAtF9EH20iQeohLMKSgfczEOQY/yqD6H+h8IcVBMjjfXlgl4PdinM0eg+iHyVmfTgCBJhDgF3mFO6AfHx8EH3EqagpBIEuYtLn3A/KEOH9UQTR/wDirwjcTYBY54o1Es+7s/Pu/kT/LjnvQyAQgUiy61xLoEj8VgrR/4bDXxBA4DuBztIe7f07t2h/JvpoE1EPAsUJjAo0+voM40oj+n//938+Vv8nwwDViAACfxPY8YGQhX140a+W+933yxIMdSKAQB0CoUV/t3Qr7V8nkjpBAIHZBMKKvpKEs/YyO2z2QwCBPQSIfsPP/rOKf1bde6Lurgj0JRBS9LOEYp/1/wB7J/O+x1jnCLwmQPSe6Jf/20wrPwxex99VBHoQIHqiLy36rw+VHsdZlwg8JhBO9F8H0++9fuyyYt6Pj8C1V1f9u9vXqvTu7gSI3hN9iyf6rw+SWQd+leDvuM8sBvbJQ4Doib6V6D+Ff/XXHfLNuudVlt6/hgDREz3RD5y1rELOUPfAGCwdJED0RN9O9O8+1WeQpRr//v+6H/Rg+eVET/REf/KYk2jdLww5mu3JiIRdRvRET/QnjueRCFzv9yFwIjZhlhA90RP9ieNI5P1EfnbmJ+KzfQnREz3RnziGZw+9dT0/EE5EaOsSoid6oj9xBAm8p8BH5n4iRtuWED3RE/2J4zdy4K3t+6FwIkpblhA90RP9wdEj7r7iHp39QZS2XSZ6oif6g+M3etit7/3BcBCnLZeJnuiJ/uDoEXdvcY/O/yBOWy4TPdET/cHRGz3o1vf+YDiI05bLRE/0RH9w9Ii7t7hH538Qpy2XiZ7oif7g6I0edOt7fzAcxGnLZaIneqI/OHrE3Vvco/M/iNOWy0RP9ER/cPRGD7r1vT8YDuK05TLREz3RHxw94u4t7tH5H8Rpy2WiJ3qiPzh6owfd+t4fDAdx2nKZ6Ime6A+OHnH3Fvfo/A/itOUy0RM90R8cvdGDbn3vD4aDOG25TPRET/QHR4+4e4t7dP4HcdpymeiJnugPjt7oQbe+9wfDQZy2XCZ6oif6g6NH3L3FPTr/gzhtuUz0RE/0B0dv9KBb3/uD4SBOWy4TPdET/cHRI+7e4h6d/0GctlwmeqIn+oOjN3rQre/9wXAQpy2XiZ7oif7g6BF3b3GPzv8gTlsuEz3RtxP9yEkbPeTW+1AYydeqtURP9ET/4rQRN3GPZuBFnLZdInqiJ/oXx2/0kFvvg+FFnLZdInqiJ/oXx4+4iXs0Ay/itO0S0RM90b84fqOH3HofDC/itO0S0RM90b84fsRN3KMZeBGnbZeInuiJ/sXxGz3k1vtgeBGnbZeInuiJ/sXxI27iHs3AizhtuxRO9J8k/k2+GNyYgZHTNnrIrffBMJKvVWuJ/kah+MD6T8gPrJHDRdzEPZqBkXytWhtS9J/Nk2RMSVaYy8jhGj3k1vf+YBjJ1sq1YUVP9kR/14fKyAEj7t7iHp3/SLZWrg0terIn+ztkP3LARg+69X0/GEZytXpteNF/AbnjwNuz5wfJV6bO/E7cfcU9MvszWdq5Jo3od0Jy79cEsn1gvu7m96sjh93anh8Kvycm5t+IPuZcUlVF9PsFlykwVT4QMzEn+kzTClor0RN90Ggq6x8CRC8KlwkQPdFfDpENbiVA9Lfi7bE50RN9j6Tn7ZLo884uTOWZRD8CLdPPkkf6srYfAaLvN/PpHRO9J/rpobLhVAJEPxVnz82Inuh7Jj9P10SfZ1ZhKyV6og8bToX9RYDoBeEyAaIn+sshssGtBIj+Vrw9Nid6ou+R9LxdEn3e2YWpnOiJPkwYFfKQANE/xOLFEQJET/QjebF2PQGiX8+83B2JnujLhbpYQ0RfbKA72iF6ot+RO/c8T4Doz7Oy8gkBoif6J9HwchACRB9kEJnLIHqiz5zfDrUTfYcp39wj0RP9zRGz/UUCRH8RoLd/fBA90TsHsQkQfez5pKiO6Ik+RVAbF0n0jYc/q3WiJ/pZWbLPPQSI/h6urXYleqJvFfiEzRJ9wqFFK5noiT5aJtXzOwGi/52Hv71BgOiJ/o3YeMtCAkS/EHbVW2UR/Qj/TF8j+FmrXwi8IkD0r+i4dooA0XuiPxUUi7YRIPpt6OvcmOiJvk6aa3ZC9DXnurQroif6pYFzs2ECRD+MzBt+EiB6ov+ZCX+PRYDoY80jZTVET/Qpg9uoaKJvNOy7WiV6or8rW/adQ4Do53BsvQvRE33rA5CgeaJPMKToJRI90UfPaPf6iL57Aib0T/REPyFGtriRANHfCLfD1lkk/1nnyK9M/8vYkb6s7UmA6HvOfVrXRO9pflqYbHQbAaK/DW2PjYme6HskPXeXRJ97fturJ3qi3x5CBRwSIPpDRBa8IkD0RP8qH67FIED0MeaQtgqiJ/q04W1UONE3GvYdrRI90d+RK3vOJUD0c3m2243oib5d6BM2TPQJhxapZKIn+kh5VMtjAkT/mItXTxLIIvqT7fy1LNP/WMrXCI5Mtu9aou87+ymdE70n+ilBssmtBIj+Vrz1Nyd6oq+f8vwdEn3+GW7tgOiJfmsA3fwUAaI/hcmiZwSInuifZcPrcQgQfZxZpKyE6Ik+ZXCbFU30zQY+u12iJ/rZmbLffAJEP59pqx2JnuhbBT5ps0SfdHBRyiZ6oo+SRXU8J0D0z9m4coIA0RP9iZhYspkA0W8eQPbbEz3RZ89wh/qJvsOUb+yR6In+xnjZehIBop8Esus2RE/0XbOfqW+izzStgLUSPdEHjKWSfhAg+h9A/HWMANET/VhirN5BgOh3UC90T6In+kJxLtsK0Zcd7ZrGiJ7o1yTNXa4QIPor9Lz3g+iJ3jGIT4Do488odIVET/ShA6q4vwgQvSBcIpBB9CMNZvsaQV8lODLdvmuJvu/sp3RO9J7opwTJJrcSIPpb8dbfnOiJvn7K83dI9PlnuLUDoif6rQF081MEiP4UJoueESB6on+WDa/HIUD0cWaRshKiJ/qUwW1WNNE3G/jsdome6Gdnyn7zCRD9fKatdiR6om8V+KTNEn3SwUUpm+iJPkoW1fGcANE/Z+PKCQJET/QnYmLJZgJEv3kA2W9P9ESfPcMd6if6DlO+sUeiJ/ob42XrSQSIfhLIrtsQPdF3zX6mvok+07QC1kr0RB8wlkr6QYDofwDx1zECRE/0Y4mxegcBot9BvdA9iZ7oC8W5bCtEX3a0axojeqJfkzR3uUKA6K/Q894UXyU4MiZfPDJCy9osBIg+y6SC1umJ3hN90Ggq6xsBov8Gwx/HCUQX/UhHGZ/mfZXgyIT7riX6vrOf0jnRe6KfEiSb3EqA6G/FW39zoif6+inP3yHR55/h1g6Inui3BtDNTxEg+lOYLHpGgOiJ/lk2vB6HANHHmUXKSoie6FMGt1nRRN9s4LPbJXqin50p+80nQPTzmbbakeiJvlXgkzZL9EkHF6Vsoif6KFlUx3MCRP+cjSsnCBA90Z+IiSWbCRD95gFkvz3RE332DHeon+g7TPnGHome6G+Ml60nESD6SSC7bkP0RN81+5n6JvpM0wpYK9ETfcBYKukHAaL/AcRfxwgQPdGPJcbqHQSIfgf1QvckeqIvFOeyrRB92dGuaYzoiX5N0tzlCgGiv0LPe8N/leDIiHzxyAgtazMRIPpM0wpYqyd6T/QBY6mkHwSI/gcQfx0jEFn0I51kfZr3VYIjU+67luj7zn5K50TviX5KkGxyKwGivxVv7c0jS/6ztpFfWZ/oR3q0ti8Bou87+8udE72n+cshssESAkS/BHPNmxA90ddMdr2uiL7eTJd1RPREvyxsbnSJANFfwtf7zURP9L1PQJ7uiT7PrMJVSvREHy6UCnpIgOgfYvHiGQJET/RncmLNfgJEv38GaSsgeqJPG95mhRN9s4HPbJfoiX5mnux1HwGiv49t+Z2JnujLh7xIg0RfZJA72iB6ot+RO/ccJ0D048y84x8CRE/0DkMOAkSfY04hqyR6og8ZTEX9QYDo/0DihbMEiJ7oz2bFur0EiH4v/9R3J3qiTx3gRsUTfaNhz26V6Il+dqbsdw8Bor+Ha4tdiZ7oWwS9QJNEX2CIu1qoIvqsXzriawR3JT/ffYk+38zCVBxZ9COQiH6ElrUZCRB9xqkFqZno/egmSBSVcUCA6A8AufycANET/fN0uBKJANFHmkayWoie6JNFtm25RN929NcbJ3qiv54iO6wgQPQrKBe9B9ETfdFol2uL6MuNdF1DRE/069LmTlcIEP0Ves3fS/RE3/wIpGmf6NOMKl6hRE/08VKpokcEiP4RFa+dIkD0RH8qKBZtJ0D020eQtwCiJ/q86e1VOdH3mvfUbome6KcGyma3ESD629DW35joib5+ymt0SPQ15rilC6In+i3Bc9NhAkQ/jMwbvggQPdF/ZcHvsQkQfez5hK6O6Ik+dEAV94sA0f9C4Q+jBIie6EczY/0eAkS/h3uJuxI90ZcIcoMmiL7BkO9qsYLoM3+7lK8SvCvZ9fYl+nozXdZRVNGPACD6EVrWZiVA9FknF6BuovejmwAxVMIJAkR/ApIljwkQPdE/ToZXoxEg+mgTSVQP0RN9ori2LpXoW4//WvNET/TXEuTdqwgQ/SrSBe9D9ERfMNYlWyL6kmNd0xTRE/2apLnLVQJEf5Vg4/cTPdE3jn+q1ok+1bhiFUv0RB8rkap5RoDon5Hx+iEBoif6w5BYEIIA0YcYQ84iiJ7ocya3X9VE32/m0zomeqKfFiYb3UqA6G/FW3tzoif62gmv0x3R15nl8k6InuiXh84N3yJA9G9h86ZPAkRP9E5CDgJEn2NOIaskeqIPGUxF/UGA6P9A4oWzBIie6M9mxbq9BIh+L//Udyd6ok8d4EbFE32jYc9uNbvos3+7lK8SnJ3ouvsRfd3Z3t5ZRNGPNE30I7SszUyA6DNPb3PtRO9HN5sj6PYnCRD9SVCW/UmA6In+z1R4JSIBoo84lSQ1ET3RJ4lq+zKJvn0E3gdA9ET/fnq8cyUBol9Ju9i9iJ7oi0W6bDtEX3a09zdG9ER/f8rcYQYBop9BsekeRE/0TaOfrm2iTzeyOAUTPdHHSaNKXhEg+ld0XHtJgOiJ/mVAXAxDgOjDjCJfIURP9PlS27Niou859yldEz3RTwmSTW4nQPS3I655g4iS/6xp5Ff2/6+bkV6t7U2A6HvP/+3uid7T/Nvh8cblBIh+OfIaNyR6oq+R5B5dEH2POU/vkuiJfnqobHgbAaK/DW3tjYme6GsnvFZ3RF9rnsu6IXqiXxY2N7pMgOgvI+y5QXbRZ/83bnyNYM9z927XRP8uuebviyj6kZEQ/Qgta7MTIPrsE9xUP9H70c2m6LntGwSI/g1o3vLxQfRE7xzkIUD0eWYVqlKiJ/pQgVTMSwJE/xKPi88IED3RP8uG1+MRIPp4M0lREdETfYqgKvIvAkQvCG8RIHqifys43rSFANFvwZ7/pkRP9PlT3KcDou8z66mdEj3RTw2UzW4lQPS34q27OdETfd101+uM6OvNdElHRE/0S4LmJlMIEP0UjP02IXqi75f6vB0Tfd7Zba2c6Il+awDdfIgA0Q/hsviLANET/VcW/B6fANHHn1HICome6EMGU1EPCRD9QyxePCJA9ER/lBHX4xAg+jizSFUJ0RN9qsA2L5bomwfg3faJnujfzY73rSdA9OuZl7hjZtFX+HYpXyVY4hgta4Lol6GudaNooh+hS/QjtKytQIDoK0xxQw9E70c3G2Lnlm8SIPo3wXV/G9ETffczkKl/os80rUC1Ej3RB4qjUg4IEP0BIJcfEyB6on+cDK9GJED0EaeSoCaiJ/oEMVXiPwSIXhTeIkD0RP9WcLxpCwGi34I9/02Jnujzp7hPB0TfZ9ZTOyV6op8aKJvdSoDob8Vbd3OiJ/q66a7XGdHXm+mSjoie6JcEzU2mECD6KRj7bUL0RN8v9Xk7Jvq8s9taOdET/dYAuvkQAaIfwmXxFwGiJ/qvLPg9PgGijz+jkBUSPdGHDKaiHhIg+odYvHhEgOiJ/igjrschQPRxZpGqEqIn+lSBbV4s0TcPwLvtEz3Rv5sd71tPgOjXMy9xx6yir/LtUr5KsMQxWtYE0S9DXetGkUQ/QpboR2hZW4UA0VeZ5OI+iN6PbhZHzu0uECD6C/A6v5Xoib5z/rP1TvTZJhakXqIn+iBRVMYJAkR/ApIlfxIgeqL/MxVeiUqA6KNOJnhdRE/0wSOqvG8EiP4bDH88T4Doif58WqzcTYDod08g6f2JnuiTRrdl2UTfcuzXmyZ6or+eIjusIkD0q0gXuw/RE32xSJduh+hLj/e+5oie6O9Ll51nEyD62USb7Ef0RN8k6iXaJPoSY1zfBNET/frUueO7BIj+XXLN30f0RN/8CKRqn+hTjStOsURP9HHSqJIjAkR/RMj1hwSInugfBsOLIQkQfcixxC+K6Ik+fkpV+EWA6L9I+H2IANET/VBgLN5KgOi34s9784yir/TtUr5KMO/Z2VE50e+gXuCeUUQ/gpLoR2hZW4kA0Vea5sJeiN6PbhbGza0uEiD6iwC7vp3oib5r9jP2TfQZpxagZqIn+gAxVMJJAkR/EpRl/08giuQ/6xj5Veln9CN9W4sA0cvAMAGi9zQ/HBpv2EqA6Lfiz3lzoif6nMntWzXR9539250TPdG/HR5v3EKA6Ldgz31Toif63AnuVz3R95v55Y6Jnugvh8gGSwkQ/VLcNW5G9ERfI8l9uiD6PrOe1inRE/20MNloCQGiX4K51k2InuhrJbp+N0Rff8bTOyR6op8eKhveSoDob8Vbc3OiJ/qaya7bFdHXne1tnRE90d8WLhvfQoDob8Fae1OiJ/raCa/XHdHXm+ntHRE90d8eMjeYSoDop+LssVlG0Vf6f670NYI9ztnMLol+Js0me0UR/Qhuoh+hZW01AkRfbaIL+iF6P7pZEDO3mEiA6CfC7LIV0RN9l6xX6ZPoq0xyYR9ET/QL4+ZWEwgQ/QSI3bYgeqLvlvns/RJ99gluqJ/oiX5D7NzyAgGivwCv61uJnui7Zj9r30SfdXIb6yZ6ot8YP7d+gwDRvwGt+1uInui7n4Fs/RN9tokFqJfoiT5ADJUwQIDoB2BZ+jcBoid6ZyEXAaLPNa8Q1RI90YcIoiJOEyD606gs/CJA9ET/lQW/5yBA9DnmFKpKoif6UIFUzCEBoj9EZMFPAkRP9D8z4e+xCRB97PmErI7oiT5kMBX1lADRP0XjwjMCRE/0z7Lh9ZgEiD7mXEJXRfREHzqgivuDANH/gcQLRwSInuiPMuJ6LAJEH2seKaoheqJPEVRF/iJA9L9Q+MNZAhFEf7bWr3W+M/aLhN87EiD6jlO/2DPRe6K/GCFvX0yA6BcDr3A7oif6Cjnu1APRd5r2xF53y360lUo/uhnt3XoEiF4G3iJA9Pue6t8amDe1JkD0rcf/fvM7Rf9u1VWe6t/t3/v6EiD6vrO/3Pku2b9beAXRv9u79/UmQPS953+5+9Wyv1pwdtlf7d/7exIg+p5zn9r1KtnPKjqr7Gf1b59+BIi+38xv6fhu2d9RdCbh39G/PfsQIPo+s17S6Wzhryg6svBX9O8e9QkQff0Z6xABBJoTIPrmAdA+AgjUJ0D09WesQwQQaE6A6JsHQPsIIFCfANHXn7EOEUCgOQGibx4A7SOAQH0CRF9/xjpEAIHmBIi+eQC0jwAC9QkQff0Z6xABBJoTIPrmAdA+AgjUJ0D09WesQwQQaE6A6JsHQPsIIFCfANHXn7EOEUCgOQGibx4A7SOAQH0CRF9/xjpEAIHmBIi+eQC0jwAC9QkQff0Z6xABBJoTIPrmAdA+AgjUJ0D09WesQwQQaE6A6JsHQPsIIFCfANHXn7EOEUCgOQGibx4A7SOAQH0CRF9/xjpEAIHmBIi+eQC0jwAC9QkQff0Z6xABBJoTIPrmAdA+AgjUJ0D09WesQwQQaE6A6JsHQPsIIFCfwP8BGJHDbMuqZLsAAAAASUVORK5CYII=")

  /*

  // Uniswap -- ETH/RAI pool APR
  const raiInUniV2RaiEth = bigNumberToNumber(multiCallData[0]._reserve0) / 1e18;
  valuesMap.set(
    "UNI_V2_ETH_RAI_APR",
    formatPercent(((30 * 365 * flxPrice) / (raiInUniV2RaiEth * 2 * raiPrice)) * 100)
  );

  // Uniswap -- ETH/RAI pool size
  valuesMap.set("UNI_V2_ETH_RAI_POOL_SIZE", nFormatter(raiInUniV2RaiEth * 2 * raiPrice, 2));

  const blockRateToYearlyRate = (blockRate: BigNumber) =>
    formatPercent((((bigNumberToNumber(blockRate) * 3600 * 24) / 13 / 1e18 + 1) ** 365 - 1) * 100);
  valuesMap.set("FUSE_RAI_SUPPLY_APY", blockRateToYearlyRate(multiCallData[9]));
  valuesMap.set("FUSE_RAI_BORROW_APY", blockRateToYearlyRate(multiCallData[8]));

  // FLX stakers APR
  const flxInUniV2FlxEth = bigNumberToNumber(multiCallData[1]._reserve0) / 1e18;
  const annualRewards = (bigNumberToNumber(multiCallData[10]) / 1e18) * 365 * 3600 * 24;
  const stakingSharesTotalSUpply = bigNumberToNumber(multiCallData[11]) / 1e18;
  const stakingAPR = ((annualRewards / BLOCK_INTERVAL) * stakingSharesTotalSUpply) / (flxInUniV2FlxEth * 2);
  valuesMap.set("FLX_STAKING_APR", formatPercent(stakingAPR * 100));

  const lpSharesInStaking = bigNumberToNumber(multiCallData[13]) / 1e18;
  const lpShareTotal = bigNumberToNumber(multiCallData[12]) / 1e18;
  const flxEthPoolSize = flxInUniV2FlxEth * 2 * flxPrice;
  valuesMap.set("FLX_STAKING_POOL_SIZE", nFormatter((flxEthPoolSize * lpSharesInStaking) / lpShareTotal, 2));

  // Uniswap V3
  const tickSpacing = 10;
  const tickToPrice = (tick: number) => 1.0001 ** tick;
  const roundPrice = (price: number, dec = 4) => (Math.round(price * 10 ** dec) / 10 ** dec).toString();
  const priceToTick = (price: number) => Math.log(price) / Math.log(1.0001);
  const flooredTick = (tick: number, tickSpacing: number) =>
    Math.floor(tick) - (Math.floor(tick) % tickSpacing);

  const marketPriceTick = multiCallData[14].tick;
  const redemptionPriceTick = priceToTick(redemptionPrice);

  const deltaLowerTick = flooredTick(Math.min(marketPriceTick, redemptionPriceTick), tickSpacing);
  const deltaUpperTick =
    flooredTick(Math.max(marketPriceTick, redemptionPriceTick), tickSpacing) + tickSpacing;

  let i = 0;
  let optimalLowerTick = deltaLowerTick;
  let optimalUpperTick = deltaUpperTick;
  let MIN_TICKS_RANGE = tickSpacing * 5;

  while (optimalUpperTick - optimalLowerTick < MIN_TICKS_RANGE) {
    if (i % 2 === 0) {
      optimalLowerTick -= tickSpacing;
    } else {
      optimalUpperTick += tickSpacing;
    }
    i++;
  }

  let recommendedLowerTick = optimalLowerTick - tickSpacing * 2;
  let recommendedUpperTick = optimalUpperTick + tickSpacing * 2;
  const allUniV3Position = await getUniV3Positions();
  const totalLiquidity = allUniV3Position
    // Filter positions that are in rnage
    // .filter(
    //   (p) =>
    //     Number(p.tickLower.tickIdx) <= optimalLowerTick && Number(p.tickUpper.tickIdx) >= optimalUpperTick
    // )
    .filter(
      (p) =>
        Number(p.tickLower.tickIdx) <= marketPriceTick &&
        Number(p.tickLower.tickIdx) <= redemptionPriceTick &&
        Number(p.tickUpper.tickIdx) >= marketPriceTick &&
        Number(p.tickUpper.tickIdx) >= redemptionPriceTick &&
        Number(p.tickUpper.tickIdx) - Number(p.tickLower.tickIdx) >= 50
    )
    // Sum all liquidity
    .reduce((acc, p) => acc + Number(p.liquidity), 0);

  const tickRangeToAPR = (arr: number[]) => {
    const liquidity = 1e18 / (1.0001 ** (arr[1] / 2) - 1.0001 ** (arr[0] / 2));
    return (((liquidity / totalLiquidity) * 10 * 365 * flxPrice) / 2.5) * 100;
  };

  valuesMap.set(
    "UNISWAP_V3_OPTIMAL",
    `${formatPercent(tickRangeToAPR([optimalLowerTick, optimalUpperTick]))}% APR (LP from ${roundPrice(
      tickToPrice(optimalLowerTick),
      4
    )} DAI to ${roundPrice(tickToPrice(optimalUpperTick), 4)} DAI)`
  );

  valuesMap.set(
    "UNISWAP_V3_RECOMMENDED",
    `${formatPercent(
      tickRangeToAPR([recommendedLowerTick, recommendedUpperTick])
    )}% APR (LP from ${roundPrice(tickToPrice(recommendedLowerTick), 4)} DAI to ${roundPrice(
      tickToPrice(recommendedUpperTick),
      4
    )} DAI)`
  );

  valuesMap.set("UNISWAP_APR", formatPercent(tickRangeToAPR([recommendedLowerTick, recommendedUpperTick])));

  valuesMap.set(
    "UNISWAP_APR_DESC",
    `FLX APR only, ignores trading fees income. Assuming a Safe with 250% cRatio and the optimal range indicated below. The optimal range is 5 tick wide if the redemption price and the market price are within 5 ticks.`
  );

  valuesMap.set("UNISWAP_V3_RAI_REDEMPTION_PRICE", roundPrice(redemptionPrice, 6));
  valuesMap.set("UNISWAP_V3_RAI_MARKET_PRICE", roundPrice(tickToPrice(marketPriceTick), 6));

  valuesMap.set(
    "R2_UNISWAP_APR_NO_DETAIL",
    formatPercent(tickRangeToAPR([optimalLowerTick, optimalUpperTick]))
  );
  valuesMap.set(
    "R3_UNISWAP_APR_NO_DETAIL",
    formatPercent(tickRangeToAPR([optimalLowerTick, optimalUpperTick]))
  );
  */

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
