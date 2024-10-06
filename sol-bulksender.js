'use strict'

const web3 = require('@solana/web3.js')
const splToken = require('@solana/spl-token')
const anchor = require('@project-serum/anchor');
const bs = require('bs58')
const parse = require('csv-parse')
const fs = require('fs')

const clusterAPI = ''; //solana RPC url
const connection = new web3.Connection(clusterAPI, "finalized");

(async () => {
    console.log("Token AIRDROP Started Here..")
    try {
        await main()
    } catch (error) {
        console.log("------- ERROR ------", error)
    }
    console.log("Token AIRDROP Completed Now..")
})();

const sleep = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

async function main() {
    const data = []
    fs.createReadStream("./users.csv")
        .pipe(parse.parse({ delimiter: ',' }))
        .on('data', (r) => {
            // console.log(r);
            data.push(r);
        })
        .on('end', async () => {
            let secret = '' // SENDER Secret KEY
            let token = '' // TOKEN address
            let sender = web3.Keypair.fromSecretKey(bs.decode(secret))
            let wallet = new anchor.Wallet(sender)
            console.log(sender.publicKey.toString())

            let tokenInfo = await getTokenInfo(connection, sender, token)
            const computePriceIx = web3.ComputeBudgetProgram.setComputeUnitPrice({
                microLamports: 1,
            });

            const computeLimitIx = web3.ComputeBudgetProgram.setComputeUnitLimit({
                units: 600000,
            });

            // controls the batch txn run
            let count = 0;
            while (data.length) {
                const chunk = data.splice(0, 5);
                console.log(chunk)

                let splTransfers = [
                    { recipient: new web3.PublicKey(chunk[0][0]), value: 30 },
                    { recipient: new web3.PublicKey(chunk[1][0]), value: 30 },
                    { recipient: new web3.PublicKey(chunk[2][0]), value: 30 },
                    { recipient: new web3.PublicKey(chunk[3][0]), value: 30 },
                    { recipient: new web3.PublicKey(chunk[4][0]), value: 30 },
                ]

                await processor(sender, tokenInfo, splTransfers, computePriceIx, computeLimitIx)
                await sleep(5000);

                count++;
                if (count >= 2) {
                    break;
                }
            }
        });
}

async function processor(sender, tokenInfo, splTransfers, computePriceIx, computeLimitIx) {
    // const START_TIME = new Date();

    let splTx = await buildSplTokenBatchTransferTx(connection, sender, tokenInfo, splTransfers)
    
    // Create the transaction with priority fees
    // Create the priority fee instructions
    const transaction = new web3.Transaction().add(
        computePriceIx,
        computeLimitIx,
        splTx
    );

    // Fetch the recent blockhash and sign the transaction
    transaction.recentBlockhash = (
        await connection.getLatestBlockhash()
    ).blockhash;

    // Send the transaction
    try {
        const txid = await web3.sendAndConfirmTransaction(connection, transaction, [
            sender,
        ])
        
        console.log("------- TRANSACTION SENT successfully with signature: -------  ", txid);
    } catch (e) {
        console.error(" ******* Failed to send transaction: ******* ", e);
    }
}

async function buildSplTokenBatchTransferTx(connection, sender, tokenInfo, transfers) {
    let token = tokenInfo.token
    let senderTokenAccount = await token.getOrCreateAssociatedAccountInfo(sender.publicKey)
    let transferedRecipients = {}
    let transaction = new web3.Transaction()
    for (const transfer of transfers) {
        let recipient = transfer.recipient
        let amount = transfer.value * Math.pow(10, tokenInfo.decimals)
        let aTokenAddress =
            await getAssociatedTokenAddress(connection, recipient, token.publicKey) ||
            transferedRecipients[recipient]
        if (aTokenAddress) {
            transaction = transaction.add(
                splToken.Token.createTransferInstruction(
                    splToken.TOKEN_PROGRAM_ID,
                    senderTokenAccount.address,
                    aTokenAddress,
                    sender.publicKey,
                    [],
                    amount
                )
            )
        } else {
            aTokenAddress = await calcAssociatedTokenAddress(recipient, token.publicKey)
            transaction = transaction.add(
                splToken.Token.createAssociatedTokenAccountInstruction(
                    splToken.ASSOCIATED_TOKEN_PROGRAM_ID,
                    splToken.TOKEN_PROGRAM_ID,
                    token.publicKey,
                    aTokenAddress,
                    recipient,
                    sender.publicKey
                ),
                splToken.Token.createTransferInstruction(
                    splToken.TOKEN_PROGRAM_ID,
                    senderTokenAccount.address,
                    aTokenAddress,
                    sender.publicKey,
                    [],
                    amount
                )
            )
        }
        transferedRecipients[recipient] = aTokenAddress
    }

    return transaction
}

// Helpers functiions
async function getTokenInfo(connection, sender, tokenContractAddress) {
    const tokenMint = new web3.PublicKey(tokenContractAddress)
    const token = new splToken.Token(connection, tokenMint, splToken.TOKEN_PROGRAM_ID, sender)
    const decimals = (await token.getMintInfo()).decimals
    return { token: token, decimals: decimals }
}

async function getAssociatedTokenAddress(connection, address, tokenMint) {
    const result = await connection.getTokenAccountsByOwner(address, { 'mint': tokenMint }, { commitment: 'confirmed' })
    if (result.value.length == 0) {
        return null
    }
    return result.value[0].pubkey
}

async function calcAssociatedTokenAddress(address, tokenMint) {
    return (await web3.PublicKey.findProgramAddress(
        [
            address.toBuffer(),
            splToken.TOKEN_PROGRAM_ID.toBuffer(),
            tokenMint.toBuffer()
        ],
        splToken.ASSOCIATED_TOKEN_PROGRAM_ID
    ))[0]
}