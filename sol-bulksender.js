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

    // SOLANA Transfer
    // let transfers = [
    //     {recipient: new web3.PublicKey('YOUR_RECIPIENT_1'), value: 0.1},
    //     {recipient: new web3.PublicKey('YOUR_RECIPIENT_2'), value: 0.2}
    // ]
    // let tx = await buildSolBatchTransferTx(sender, transfers)
    // let signature = await web3.sendAndConfirmTransaction(
    //     connection,
    //     tx,
    //     [sender]
    // )
    // console.log('SIGNATURE', signature)

    // SPL Transfer
    // let tokenInfo = await getTokenInfo(connection, sender, 'FkbWN4dcFQym2PgCELfThghQqLuA2e2jThMJyhZjfG4M')
    let splTx = await buildSplTokenBatchTransferTx(connection, sender, tokenInfo, splTransfers)
    // let hash = await connection.getLatestBlockhash();
    // splTx.recentBlockhash = hash.blockhash;
    // let lastValidHeight = hash.lastValidBlockHeight;
    // splTx.feePayer = sender.publicKey;

    // *********************
    // const provider = new anchor.AnchorProvider(connection, wallet, {
    //     preflightCommitment: 'confirmed',
    // });
    // const confirmation = await provider.sendAndConfirm(splTx, [sender]);
    // console.log('confirmation resp', confirmation);

    // const signature = await wallet.signTransaction(splTx);
    // console.log('signature', signature);
    // const serializedTransaction = signature.serialize({ requireAllSignatures: false });
    // const base64Transaction = serializedTransaction.toString('base64');
    // let resp = await connection.sendEncodedTransaction(base64Transaction);
    // *********************

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
    // transaction.sign([sender]);

    // WORKING - Send the transaction
    try {
        const txid = await web3.sendAndConfirmTransaction(connection, transaction, [
            sender,
        ])
        
        console.log("------- TRANSACTION SENT successfully with signature: -------  ", txid);
    } catch (e) {
        console.error(" ******* Failed to send transaction: ******* ", e);
    }

    // try {
    //     let resp = connection.sendTransaction(
    //         splTx,
    //         [sender],
    //         {
    //             maxRetries: 3,
    //             skipPreflight: false,
    //             preflightCommitment: "finalized"
    //         }
    //     ).catch((err) => {
    //         console.error(" ******* Failed to send transaction: ******* ", err);
    //     });
    //     console.log('Transaction ID: - ', resp);
    // } catch (e) {
    //     console.error(" ******* Failed to send transaction: ******* ", e);
    // }


    // **** ---------------------
    // Step 4 - Check transaction status and blockhash status until the transaction succeeds or blockhash expires
    // let hashExpired = false;
    // let txSuccess = false;
    // let count = 0;
    // while (!hashExpired && !txSuccess && count <= 5) {
    //     const { value: status } = await connection.getSignatureStatus(resp);

    //     // Break loop if transaction has succeeded
    //     if (status && ((status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized'))) {
    //         txSuccess = true;
    //         const endTime = new Date();
    //         const elapsed = (endTime.getTime() - START_TIME.getTime()) / 1000;
    //         console.log(`Transaction Success. Elapsed time: ${elapsed} seconds.`);
    //         console.log(`https://explorer.solana.com/tx/${txId}`);
    //         break;
    //     }

    //     hashExpired = await isBlockhashExpired(connection, lastValidHeight);

    //     // Break loop if blockhash has expired
    //     if (hashExpired) {
    //         const endTime = new Date();
    //         const elapsed = (endTime.getTime() - START_TIME.getTime()) / 1000;
    //         console.log(`Blockhash has expired. Elapsed time: ${elapsed} seconds.`);
    //         hash = await connection.getLatestBlockhash();
    //         lastValidHeight = hash.lastValidBlockHeight;

    //         resp = await connection.sendTransaction(
    //             splTx,
    //             [sender],
    //             {
    //                 maxRetries: 3,
    //                 skipPreflight: false,
    //                 preflightCommitment: "finalized"
    //             }
    //         )
    //         console.log('NEW Transaction ID: - ', resp);
    //         // (add your own logic to Fetch a new blockhash and resend the transaction or throw an error)
    //         count++;
    //         break;
    //     }

    //     // Check again after 2.5 sec
    //     await sleep(4000);
    // }
    // ** --------

    // const { signature } = await provider.signAndSendTransaction(splTx);
    // const confirmation = await connection.confirmTransaction(
    //     {
    //         blockhash: hash.blockhash,
    //         lastValidBlockHeight: hash.lastValidBlockHeight,
    //         signature,
    //     }
    // );
    // console.log('SPL_SIGNATURE', confirmation.value)



    // let splSignature = await web3.sendAndConfirmTransaction(
    //     connection,
    //     splTx,
    //     [sender],

    // )
    // console.log('SPL_SIGNATURE', splSignature)
}

async function isBlockhashExpired(connection, lastValidBlockHeight) {
    let currentBlockHeight = (await connection.getBlockHeight('finalized'));
    console.log('                           ');
    console.log('Current Block height:             ', currentBlockHeight);
    console.log('Last Valid Block height - 150:     ', lastValidBlockHeight - 150);
    console.log('--------------------------------------------');
    console.log('Difference:                      ', currentBlockHeight - (lastValidBlockHeight - 150)); // If Difference is positive, blockhash has expired.
    console.log('                           ');

    return (currentBlockHeight > lastValidBlockHeight - 150);
}

async function buildSolBatchTransferTx(sender, transfers) {
    let transaction = new web3.Transaction()
    for (let i = 0; i < transfers.length; i++) {
        let transfer = transfers[i]

        transaction = transaction.add(
            web3.SystemProgram.transfer({
                fromPubkey: sender.publicKey,
                toPubkey: transfer.recipient,
                lamports: transfer.value * web3.LAMPORTS_PER_SOL,
            })
        )
    }
    return transaction
}

async function buildSplTokenBatchTransferTx(connection, sender, tokenInfo, transfers) {
    let token = tokenInfo.token
    let senderTokenAccount = await token.getOrCreateAssociatedAccountInfo(sender.publicKey)
    let transferedRecipients = {}
    let transaction = new web3.Transaction()
    for (var i = 0; i < transfers.length; i++) {
        let transfer = transfers[i]
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