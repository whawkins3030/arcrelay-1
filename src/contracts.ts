import { DecodedLogEvent, ZeroEx } from '0x.js';
import { BigNumber } from '@0xproject/utils';
import { TransactionReceiptWithDecodedLogs } from '@0xproject/types';
import * as Web3 from 'web3';


const TESTRPC_NETWORK_ID = 50;

// create a provider pointing to local TestRPC on default port 8545
const provider = new Web3.providers.HttpProvider('http://localhost:8545');

// set configs
const configs = {
    networkId: TESTRPC_NETWORK_ID,
};

// instantiate zeroEx
const zeroEx = new ZeroEx(provider, configs);


// set contract and exchange addresses
const WETH_ADDRESS = zeroEx.etherToken.getContractAddressIfExists() as string; // The wrapped ETH token contract
const ZRX_ADDRESS = zeroEx.exchange.getZRXTokenAddress(); // The ZRX token contract
// The Exchange.sol address (0x exchange smart contract)
const EXCHANGE_ADDRESS = zeroEx.exchange.getContractAddress();



// Ethereum Virtual Machine doesn't use decimals so we need to set DECIMALS
// to convert our amounts with BigNumber()
// Number of decimals to use (for ETH and ZRX)
const DECIMALS = 18;

export const logAddressesAsync = async () => {
    try {
        const availableAddresses = await zeroEx.getAvailableAddressesAsync();
        console.log("Accounts:", availableAddresses);
        return availableAddresses;
    } catch (error) {
        console.log( error);
        return [];
    }
};


//call this with taker address before generating order
export const convertWethAsync = async (intEthAmount:number, wethDestAddress :string) => {
  // Deposit WETH
  const ethAmount = new BigNumber(intEthAmount);
  const ethToConvert = ZeroEx.toBaseUnitAmount(ethAmount, DECIMALS); // Number of ETH to convert to WETH

  const convertEthTxHash = await zeroEx.etherToken.depositAsync(WETH_ADDRESS, ethToConvert, wethDestAddress);
  const txReceipt = await zeroEx.awaitTransactionMinedAsync(convertEthTxHash);
  console.log(intEthAmount + ' ETH -> WETH conversion mined...');
  console.log('Eth2Weth transaction receipt: ', txReceipt);

  return txReceipt;
};


export const createAsync = async (makerAddress:string, takerAddress:string, makerToken:string, takerToken:string, makerAmount:number, takerAmount:number) => { //add amount and buy/sell token and expiration time

    const contracts = {
        "ZRX": ZRX_ADDRESS,
        "WETH": WETH_ADDRESS
    }

    //could wrap this in a try - catch, but there should always be a value from the dropdown
    let makerTokenAddress = contracts[makerToken];
    let takerTokenAddress = contracts[takerToken];

    //hard code in accounts from testRPC:  (replace with user input addresses later )
    // Getting list of accounts
    //const availableAddresses = await zeroEx.getAvailableAddressesAsync();

    //set allowances, we just use unlimited for now, make rules later
    // Unlimited allowances to 0x proxy contract for maker and taker
    const setMakerAllowTxHash = await zeroEx.token.setUnlimitedProxyAllowanceAsync(makerTokenAddress, makerAddress);
    await zeroEx.awaitTransactionMinedAsync(setMakerAllowTxHash);

    const setTakerAllowTxHash = await zeroEx.token.setUnlimitedProxyAllowanceAsync(takerTokenAddress, takerAddress);
    await zeroEx.awaitTransactionMinedAsync(setTakerAllowTxHash);
    console.log('Taker allowance mined...');

    // Generate order
    const order = {
        maker: makerAddress,
        taker: ZeroEx.NULL_ADDRESS,
        feeRecipient: ZeroEx.NULL_ADDRESS,
        makerTokenAddress: makerTokenAddress,
        takerTokenAddress: takerTokenAddress,
        exchangeContractAddress: EXCHANGE_ADDRESS,
        salt: ZeroEx.generatePseudoRandomSalt(),
        makerFee: new BigNumber(0),
        takerFee: new BigNumber(0),
        makerTokenAmount: ZeroEx.toBaseUnitAmount(new BigNumber(makerAmount), DECIMALS), // Base 18 decimals
        takerTokenAmount: ZeroEx.toBaseUnitAmount(new BigNumber(takerAmount), DECIMALS), // Base 18 decimals
        expirationUnixTimestampSec: new BigNumber(Date.now() + 3600000), // Valid for up to an hour
    };

    // Create orderHash
    const orderHash = ZeroEx.getOrderHashHex(order);

    console.log("orderHash = ", orderHash, "\n");

    //return the order hash and order JSON object
    return [orderHash, order];
};

export const signAsync = async (orderHash:string, makerAddress:string, order:any) => {
  // Signing orderHash -> ecSignature
  const shouldAddPersonalMessagePrefix = false;
  const ecSignature = await zeroEx.signOrderHashAsync(orderHash, makerAddress, shouldAddPersonalMessagePrefix);

  // Appending signature to order
  const signedOrder = {
      ...order,
      ecSignature,
  };

  console.log("Signed order...");
  console.log("Signature: " + JSON.stringify(ecSignature))

  return signedOrder;
};



export const fillAsync = async (signedOrder:any, takerAddress:string, fillAmount:number) => {

    signedOrder = convertSignedOrder(signedOrder);
    // Verify that order is fillable
    try {
        await zeroEx.exchange.validateOrderFillableOrThrowAsync(signedOrder);
    } catch {
        console.log("Error: invalid order");
    }

    // Try to fill order
    const shouldThrowOnInsufficientBalanceOrAllowance = true;
    const fillTakerTokenAmount = ZeroEx.toBaseUnitAmount(new BigNumber(fillAmount), DECIMALS);

    // Filling order
    const txHash = await zeroEx.exchange.fillOrderAsync(
        signedOrder,
        fillTakerTokenAmount,
        shouldThrowOnInsufficientBalanceOrAllowance,
        takerAddress,
    );

    // Transaction receipt
    const txReceipt = await zeroEx.awaitTransactionMinedAsync(txHash);
    console.log('FillOrder transaction receipt: ', txReceipt);

    return txReceipt;
}

// createbignumber

const convertSignedOrder = (signedOrder:any) => {
    signedOrder.salt = new BigNumber(signedOrder.salt);
    signedOrder.makerFee = new BigNumber(signedOrder.makerFee);
    signedOrder.takerFee = new BigNumber(signedOrder.takerFee);
    signedOrder.makerTokenAmount = new BigNumber(signedOrder.makerTokenAmount);
    signedOrder.takerTokenAmount = new BigNumber(signedOrder.takerTokenAmount);
    signedOrder.expirationUnixTimestampSec = new BigNumber(signedOrder.expirationUnixTimestampSec);

    return signedOrder;
};


//calls all the functions contained in this file with some smaple inputs for testing purposes
export const testAll = async () => {
    let ethAmount = 0.5;
    let wethDestAddress = "0x6ecbe1db9ef729cbe972c83fb886247691fb6beb";

    await convertWethAsync(ethAmount, wethDestAddress);

    let makerAddress:string = "0x5409ed021d9299bf6814279a6a1411a7e866a631";
    let takerAddress:string = "0x6ecbe1db9ef729cbe972c83fb886247691fb6beb";

    let makerToken:string = "ZRX";
    let takerToken:string = "WETH";

    let makerAmount:number = 0.2;
    let takerAmount:number = 0.3;

    let resp:any = await createAsync(makerAddress, takerAddress, makerToken, takerToken, makerAmount, takerAmount);
    let orderHash:string = resp[0];
    let order:any = resp[1];

    await console.log("order = ", order);
    await console.log("orderHash = ", orderHash);

    let signedOrder:any = await signAsync(orderHash, makerAddress, order);

    console.log("******* CORRECT ONE ****** vvv");
    console.log("signedOrder = ", signedOrder);

    let fillAmount = 0.2; // partial fill
    const txReceipt:any = await fillAsync(signedOrder, takerAddress, fillAmount);

}
