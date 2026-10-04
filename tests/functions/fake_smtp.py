#!/usr/bin/env python3
"""A tiny stand-in for Gmail's mail server (SMTP over TLS, like port 465).
Accepts AUTH PLAIN with the password given on the command line and saves
each message it receives to OUT_DIR/<n>.eml. For tests only."""
import asyncio, base64, os, ssl, sys

PORT, CERT, KEY, OUT, PASSWORD = int(sys.argv[1]), sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5]
os.makedirs(OUT, exist_ok=True)
count = 0

async def handle(reader, writer):
    global count
    def say(s): writer.write((s + "\r\n").encode())
    say("220 fake.smtp ready")
    authed, rcpt, mail_from = False, [], None
    while True:
        line = await reader.readline()
        if not line: break
        cmd = line.decode().rstrip("\r\n")
        up = cmd.upper()
        if up.startswith("EHLO"):
            say("250-fake.smtp"); say("250 AUTH PLAIN LOGIN")
        elif up.startswith("AUTH PLAIN "):
            parts = base64.b64decode(cmd[11:]).split(b"\0")
            if len(parts) == 3 and parts[2].decode() == PASSWORD:
                authed = True; say("235 2.7.0 Accepted")
            else:
                say("535 5.7.8 Username and Password not accepted")
        elif up.startswith("MAIL FROM:"):
            if not authed: say("530 5.7.0 Authentication Required"); continue
            mail_from, rcpt = cmd[10:], []; say("250 OK")
        elif up.startswith("RCPT TO:"):
            if "bounce" in cmd: say("550 5.1.1 No such user"); continue
            rcpt.append(cmd[8:]); say("250 OK")
        elif up == "DATA":
            say("354 Go ahead"); await writer.drain()
            data = []
            while True:
                l = await reader.readline()
                if l in (b".\r\n", b".\n"): break
                if l.startswith(b".."): l = l[1:]
                data.append(l)
            count += 1
            with open(os.path.join(OUT, f"{count:03d}.eml"), "wb") as f:
                f.write(b"X-Envelope-To: " + ",".join(rcpt).encode() + b"\r\n" + b"".join(data))
            say("250 2.0.0 OK saved")
        elif up == "RSET":
            say("250 OK")
        elif up == "QUIT":
            say("221 bye"); await writer.drain(); break
        else:
            say("502 not implemented")
        await writer.drain()
    writer.close()

async def main():
    ctx = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
    ctx.load_cert_chain(CERT, KEY)
    srv = await asyncio.start_server(handle, "127.0.0.1", PORT, ssl=ctx)
    print("ready", flush=True)
    async with srv: await srv.serve_forever()

asyncio.run(main())
