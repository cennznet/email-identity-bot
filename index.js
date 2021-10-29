const { Api } = require('@cennznet/api');
const { Keyring } = require('@polkadot/keyring');
const { cryptoWaitReady, blake2AsHex } = require('@polkadot/util-crypto');
const fs = require("fs");
const { checkMail, connectEmail } = require('./emailReader');
const provider = 'ws://localhost:9944';

let api;
let keyring;
let eve;
const REG_INDEX = 0;

async function initialise() {
    // Create account key pair
    const types = { "MarketplaceId": "u32" }
    await cryptoWaitReady();
    api = await Api.create({provider, types});
    keyring = new Keyring({ type: 'sr25519' });
    console.log(`Connect to CENNZnet network ${provider}`);
    eve = keyring.addFromUri('//Eve');
}

function openJasonFile(file_path) {
    try {
         //let buffer = fs.readFileSync(file_path, 'utf-8');
        return JSON.parse(fs.readFileSync(file_path).toString());
    } catch (err) {
        // console.log("Error parsing JSON string:", err);
    }
}

function addCENNZnetClaim(identity) {
    const file_path = "./data/CENNZnetActiveClaims.json";
    let claims = openJasonFile(file_path);
    if (!claims) { return }
    let already_existing = false;
    for (let i = 0; i < claims["claims"].length; i++) {
        // Check if account already exists
        if (claims["claims"][i].CENNZ_account === identity.CENNZ_account) {
            claims["claims"][i] = identity;
            already_existing = true;
        }
    }
    if (!already_existing) {
        claims["claims"].push(identity);
    }
    const new_json_string = JSON.stringify(claims, null, 2);
    fs.writeFile(file_path, new_json_string, err => {
        if (err) {
            console.log('Error writing file', err);
        } else {
            console.log('Successfully added CENNZnet account to file: ' + identity.CENNZ_account);
        }
    });
}

function findMatch() {
    console.log("-- Searching for matches");
    const cennz_file_path = "./data/CENNZnetActiveClaims.json";
    const email_file_path = "./data/EmailsAwaitingClaims.json";

    let CENNZnet_claims = openJasonFile(cennz_file_path);
    if (!CENNZnet_claims) { return }
    let email_claims = openJasonFile(email_file_path);
    if (!email_claims) { return }

    let match_found = false;
    for (let i = 0; i < CENNZnet_claims["claims"].length; i++) {
        let email_keys = Object.keys(email_claims);
        for (let j = 0; j < email_keys.length; j++) {
            let key = email_keys[j];
            const email_hash = blake2AsHex(key);
            if (email_hash === CENNZnet_claims["claims"][i].email_hash) {
                console.log("++ Match found!");
                // Try send transaction to CENNZnet
                if (!api) break;
                try {
                    const target = CENNZnet_claims["claims"][i].CENNZ_account;
                    const judgement = "Reasonable";
                    const extrinsic = api.tx.identity.provideJudgement(REG_INDEX, target, judgement);
                    extrinsic.signAndSend(eve);
                    delete email_claims[key];
                    CENNZnet_claims["claims"].splice(i, 1);
                    match_found = true;
                    console.log("++ Judgement given for account: " + target)
                    break;
                } catch(err) {
                    console.log(err);
                }
            }
        }
        if (match_found) break;
    }

    if (!match_found) return;

    // Rewrite CENNZnet File
    const new_CENNZ_json_string = JSON.stringify(CENNZnet_claims, null, 2);
    fs.writeFile(cennz_file_path, new_CENNZ_json_string, err => {
        if (err) {
            console.log('Error writing file', err);
        }
    });
    // Rewrite CENNZnet File
    const new_email_json_string = JSON.stringify(email_claims, null, 2);
    fs.writeFile(email_file_path, new_email_json_string, err => {
        if (err) {
            console.log('Error writing file', err);
        }
    });
}

async function processDataAtBlockHash(blockHash) {
    const block = await api.rpc.chain.getBlock(blockHash);
    if (block) {
        const extrinsics = block.block.extrinsics.toHuman();
        const filteredExtrinsics = extrinsics.filter(ext => ext.isSigned && ext.method.section === 'identity');
        if (filteredExtrinsics.length > 0) {
            for (let i = 0; i < filteredExtrinsics.length; i++) {
                if (filteredExtrinsics[i].method.method === 'setIdentity') {
                    console.log("-- New CENNZnet identity transaction");
                    const args = filteredExtrinsics[i].method.args;
                    if (args[0]) {
                        const key = Object.keys(args[0].email)[0];
                        if (key === 'BlakeTwo256') {
                            let email_hash = args[0].email[key];
                            const identity = {
                                "CENNZ_account": filteredExtrinsics[i].signer,
                                "email_hash": email_hash
                            }
                            // Save identity to json file
                            addCENNZnetClaim(identity);
                        }
                    }
                }
            }
        }
    } else {
        console.log(`Retrieving block details from rpc.chain.getBlock failed for hash ${blockHash}`)
    }
    //Process Emails
    checkMail(keyring);
    //Check for matches
    findMatch();
}

async function main() {
    // Scan the finalized block and store it in db
    await api.rpc.chain.subscribeFinalizedHeads(async (head) => {
        const finalizedBlockAt = head.number.toNumber();
        console.log("\n===== Block Number: " + finalizedBlockAt.toString() + " =====")
        const blockHash = await api.rpc.chain.getBlockHash(finalizedBlockAt.toString());
        await processDataAtBlockHash(blockHash);
    });
}

initialise().then(() => {
    //imap.connect();
    connectEmail();
    main().catch((error) => {
        console.error(error);
    });
})

