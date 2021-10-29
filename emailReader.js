// Read through emails
const Imap = require('node-imap');
const MailParser = require('mailparser').simpleParser;
const fs = require("fs");


const imap = new Imap({
    user: process.env.EMAIL_ADDRESS,
    password: process.env.EMAIL_PASSWORD,
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
});
const MARK_AS_SEEN = true;
let email_connected = false;

function openJasonFile(file_path) {
    try {
        return JSON.parse(fs.readFileSync(file_path, 'utf8'));
    } catch (err) {
        console.log("Error parsing JSON string:", err);
    }
}

function addEmailClaim(email, address) {
    const file_path = "./data/EmailsAwaitingClaims.json"
    let email_list = openJasonFile(file_path);
    if (!email_list) return;
    let already_existing = false;

    Object.keys(email_list).forEach(function(key) {
        if (key === email) {
            email_list[key] = address;
            already_existing = true;
        }
    })

    if (!already_existing) {
        email_list[email] = address;
    }

    const new_json_string = JSON.stringify(email_list, null, 2);
    fs.writeFile(file_path, new_json_string, err => {
        if (err) {
            console.log('Error writing file', err);
        } else {
            console.log('Successfully added email to file: ' + email);
        }
    });
}

function verifyAddress(address, keyring) {
    console.log("Verifying " + address);
    try {
        keyring.encodeAddress(address);
    } catch (err) {
        console.log(err);
        return false;
    }
    return true;
}

function openInbox(cb) {
    imap.openBox('INBOX', false, cb);
}

function checkMail(keyring) {
    if (!email_connected) { return }
    openInbox(function(err, _box) {
        if (err) throw err;
        console.log("-- Checking Emails")
        imap.search([ 'UNSEEN' ], function(err, results) {
            if (err) throw err;
            if (results.length <= 0) {return}
            var f = imap.fetch(results, { bodies: '' });
            f.on('message', function(msg, seqno) {
                console.log('- Reading message #%d', seqno);
                msg.on('body', function(stream, info) {
                    MailParser(stream, async (err, parsed) => {
                        let {from, text} = parsed;
                        if (verifyAddress(text.trim(), keyring)) {
                            //Write to file
                            addEmailClaim(from.value[0].address, text.trim());
                        }
                    });
                });
                msg.on('attributes', function(attrs) {
                    if (MARK_AS_SEEN) {
                        imap.setFlags(attrs.uid, ['\\Seen'], () => {
                            console.log('- Marked as read!');
                        });
                    }
                });
            });
            f.once('error', function(err) {
                console.log('Fetch error: ' + err);
            });
        });
    });
}

imap.on('ready', async function() {
    email_connected = true;
});

imap.on('error', function(err) {
    console.log(err);
});

function connectEmail() {
    imap.connect();
}

module.exports = {
    connectEmail,
    checkMail
};