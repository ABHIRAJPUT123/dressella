import asyncio
import ipaddress
import os
import re
import smtplib
from email.message import EmailMessage
from email.utils import formataddr, make_msgid, parseaddr
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx

from core import db, logger, new_id, now_iso

# Emergent managed email proxy — constant by design (survives deployment).
EMAIL_BASE_URL = "https://integrations.emergentagent.com"

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host):
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown, real):
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject, html):
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} ≠ real link host {real!r} (G3)")


def email_backend():
    configured = os.environ.get("EMAIL_BACKEND", "").strip().lower()
    if configured and configured not in {"emergent", "log", "mailpit"}:
        raise ValueError("EMAIL_BACKEND must be emergent, log, or mailpit.")
    if configured == "mailpit":
        return configured
    if configured == "emergent" and os.environ.get("EMERGENT_EMAIL_KEY"):
        return configured
    if not configured and os.environ.get("EMERGENT_EMAIL_KEY"):
        return "emergent"
    return "log"


def email_configured():
    return email_backend() != "log"


def brand():
    return os.environ.get("EMAIL_FROM_NAME", "DRESSELLA")


def site():
    return os.environ["FRONTEND_URL"].rstrip("/")


def _sandbox_address(value, label):
    address = parseaddr(value)[1]
    if address != value or not re.fullmatch(r"[^@\s<>]+@(?:[A-Za-z0-9-]+\.)*test", value, re.I):
        raise ValueError(f"{label} must use the reserved .test domain.")
    return value


def _mailpit_recipient(value):
    address = parseaddr(value)[1]
    if address != value:
        raise ValueError("Mailpit recipient must be a plain email address.")
    domain = value.rsplit("@", 1)[-1].lower() if "@" in value else ""
    if domain != "example.com" and not domain.endswith((".example.com", ".test")):
        raise ValueError("Mailpit only accepts reserved example.com or .test recipients.")
    return value


def _mailpit_settings():
    host = os.environ.get("MAILPIT_SMTP_HOST", "127.0.0.1").strip()
    try:
        if not ipaddress.ip_address(host).is_loopback:
            raise ValueError
    except ValueError as exc:
        raise ValueError("Mailpit SMTP must use a loopback IP address.") from exc

    try:
        port = int(os.environ.get("MAILPIT_SMTP_PORT", "1025"))
    except ValueError as exc:
        raise ValueError("MAILPIT_SMTP_PORT must be a valid TCP port.") from exc
    if not 1 <= port <= 65535:
        raise ValueError("MAILPIT_SMTP_PORT must be between 1 and 65535.")

    sender = _sandbox_address(os.environ.get("EMAIL_FROM_ADDRESS", "no-reply@anora.test").strip(), "EMAIL_FROM_ADDRESS")
    return host, port, sender


def _send_to_mailpit(host, port, sender, recipient, subject, html):
    recipient = _mailpit_recipient(recipient)
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = formataddr((brand(), sender))
    message["To"] = recipient
    message["Message-ID"] = make_msgid(domain="anora.test")
    message.set_content("This email is captured locally in the Mailpit test inbox.")
    message.add_alternative(html, subtype="html")
    with smtplib.SMTP(host, port, timeout=10) as smtp:
        smtp.send_message(message)
    return message["Message-ID"]


async def send_email(*, to, subject, html, kind, ref=""):
    """Send through the configured backend; Mailpit mode only delivers to a local test sink."""
    _assert_safe_email(subject, html)
    backend = email_backend()
    rec = {"id": new_id(), "to": to, "subject": subject, "kind": kind, "ref": ref, "created_at": now_iso(), "status": "logged", "provider_id": None, "error": None}
    if backend == "log":
        logger.info(f"EMAIL_NOT_CONFIGURED [{kind}] to={to} subject={subject!r} ref={ref}")
        await db.email_log.insert_one(dict(rec))
        return None
    if backend == "mailpit":
        try:
            host, port, sender = _mailpit_settings()
            provider_id = await asyncio.to_thread(_send_to_mailpit, host, port, sender, to, subject, html)
            rec.update(status="sent", provider_id=provider_id)
        except ValueError as e:
            logger.error(f"Mailpit email capture failed [{kind}]")
            safe_error = str(e)
            if safe_error not in {
                "Mailpit SMTP must use a loopback IP address.",
                "Mailpit recipient must be a plain email address.",
                "Mailpit only accepts reserved example.com or .test recipients.",
                "EMAIL_FROM_ADDRESS must use the reserved .test domain.",
                "MAILPIT_SMTP_PORT must be a valid TCP port.",
                "MAILPIT_SMTP_PORT must be between 1 and 65535.",
            }:
                safe_error = "delivery_failed"
            rec.update(status="failed", error=safe_error)
        except Exception:
            logger.error(f"Mailpit email capture failed [{kind}]")
            rec.update(status="failed", error="delivery_failed")
        await db.email_log.insert_one(dict(rec))
        return rec.get("provider_id")

    payload = {"to": [to], "subject": subject, "html": html, "from_name": brand()}
    reply_to = os.environ.get("EMAIL_REPLY_TO")
    if reply_to:
        payload["contact_email"] = reply_to
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(f"{EMAIL_BASE_URL}/api/v1/email/send", headers={"X-Email-Key": os.environ["EMERGENT_EMAIL_KEY"]}, json=payload)
        resp.raise_for_status()
        rec.update(status="sent", provider_id=resp.json().get("id"))
    except httpx.HTTPStatusError as e:
        try:
            j = e.response.json()
        except ValueError:
            j = {}
        code = j.get("code", "")
        if code in ("insufficient_credits", "integration_disabled", "daily_limit_reached"):
            logger.warning(f"Email paused: {code} ({e.response.status_code})")
        else:
            logger.error(f"Email send failed: {e.response.status_code}")
        safe_code = (
            code
            if code in ("insufficient_credits", "integration_disabled", "daily_limit_reached")
            else f"http_{e.response.status_code}"
        )
        rec.update(status="failed", error=safe_code)
    except Exception:
        logger.error(f"Email send error [{kind}]")
        rec.update(status="failed", error="delivery_failed")
    await db.email_log.insert_one(dict(rec))
    return rec.get("provider_id")


def fire(coro):
    """Schedule an email without blocking the request."""
    async def _run():
        try:
            await coro
        except Exception:
            logger.error("email task failed")
    asyncio.create_task(_run())


# ---------- Templates (server-side only; all interpolation escaped) ----------
INK, TAUPE, LINE, IVORY, SAND = "#1A1918", "#7A7168", "#E3DCD2", "#FBF8F3", "#F3EEE7"


def inr(n):
    s = f"{int(n):,}"
    return "₹" + s


def layout(title, intro, body_html, cta=None, footer_note=""):
    cta_html = ""
    if cta:
        cta_html = (f'<tr><td style="padding:8px 0 28px"><a href="{escape(cta[1])}" style="display:inline-block;background:{INK};color:{IVORY};text-decoration:none;'
                    f'padding:14px 28px;font-size:12px;letter-spacing:0.18em;text-transform:uppercase">{escape(cta[0])}</a></td></tr>')
    return f"""<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{SAND};padding:32px 12px;font-family:Georgia,'Times New Roman',serif;color:{INK}">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:{IVORY};border:1px solid {LINE}">
<tr><td style="padding:36px 40px 12px;text-align:center;font-size:22px;letter-spacing:0.38em">DRESSELLA</td></tr>
<tr><td style="padding:0 40px 8px;text-align:center;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:{TAUPE};font-family:Arial,Helvetica,sans-serif">Luxury womenswear · India</td></tr>
<tr><td style="padding:28px 40px 0"><h1 style="margin:0;font-weight:normal;font-size:28px;line-height:1.25">{escape(title)}</h1></td></tr>
<tr><td style="padding:14px 40px 24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:{INK}">{intro}</td></tr>
<tr><td style="padding:0 40px">{body_html}</td></tr>
<tr><td style="padding:0 40px"><table role="presentation" cellpadding="0" cellspacing="0">{cta_html}</table></td></tr>
<tr><td style="padding:24px 40px 36px;border-top:1px solid {LINE};font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.7;color:{TAUPE}">
{footer_note}Sent by {escape(brand())}. We never ask for your password or card details by email. Questions? Reply to this email or visit <a href="{escape(site())}/contact" style="color:{TAUPE}">our contact page</a>.
</td></tr>
</table></td></tr></table>"""


def lines_table(order):
    rows = "".join(
        f'<tr><td style="padding:10px 0;border-bottom:1px solid {LINE};font-family:Arial,Helvetica,sans-serif;font-size:13px">{escape(l["title"])}'
        f'<br><span style="color:{TAUPE};font-size:12px">Size {escape(str(l["size"]))} · Qty {int(l["qty"])}</span></td>'
        f'<td align="right" style="padding:10px 0;border-bottom:1px solid {LINE};font-family:Arial,Helvetica,sans-serif;font-size:13px;white-space:nowrap">{inr(l["line_total"])}</td></tr>'
        for l in order["lines"])
    t = order["totals"]
    def row(k, v, bold=False):
        w = "font-weight:bold;" if bold else ""
        return f'<tr><td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;{w}">{k}</td><td align="right" style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;{w}">{v}</td></tr>'
    totals = row("Subtotal", inr(t["subtotal"]))
    if t.get("discount"):
        totals += row("Discount" + (f' ({escape(order["coupon"]["code"])})' if order.get("coupon") else ""), "−" + inr(t["discount"]))
    totals += row("Shipping", inr(t["shipping"]) if t.get("shipping") else "Complimentary")
    totals += row("Total (incl. taxes)", inr(t["total"]), True)
    return f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">{rows}<tr><td colspan="2" style="height:10px"></td></tr>{totals}</table>'


def address_block(a):
    parts = [a.get("name"), a.get("line1"), a.get("line2"), f'{a.get("city", "")}, {a.get("state", "")} {a.get("pincode", "")}', f'Phone: {a.get("phone", "")}']
    return f'<p style="margin:16px 0 24px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.7;color:{INK}"><span style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:{TAUPE}">Delivering to</span><br>' + "<br>".join(escape(str(p)) for p in parts if p) + "</p>"


def order_link(order):
    return f'{site()}/order/{order["id"]}?t={order["access_token"]}'


def first_name(order):
    return escape((order.get("shipping", {}).get("name") or "there").split(" ")[0])


async def send_order_confirmed(order):
    html = layout(f"Order {order['order_number']} confirmed",
                  f"Thank you, {first_name(order)}. Your payment has been verified and your order is now being prepared with care. We'll write again the moment it ships.",
                  lines_table(order) + address_block(order["shipping"]), ("View your order", order_link(order)))
    await send_email(to=order["email"], subject=f"Your DRESSELLA order {order['order_number']} is confirmed", html=html, kind="order_confirmed", ref=order["order_number"])


async def send_order_shipped(order):
    tr = order.get("tracking") or {}
    track = ""
    if tr.get("number"):
        track = (f'<p style="margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.7"><span style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:{TAUPE}">Tracking</span><br>'
                 f'{escape(tr.get("carrier") or "Courier")} · {escape(tr["number"])}</p>')
    cta = ("Track your parcel", tr["url"]) if tr.get("url", "").startswith("https://") else ("View your order", order_link(order))
    html = layout(f"Order {order['order_number']} is on its way",
                  f"Good news, {first_name(order)} — your parcel has left our atelier and is travelling to you.", track + lines_table(order) + address_block(order["shipping"]), cta)
    await send_email(to=order["email"], subject=f"Your DRESSELLA order {order['order_number']} has shipped", html=html, kind="order_shipped", ref=order["order_number"])


async def send_order_delivered(order):
    html = layout(f"Order {order['order_number']} delivered",
                  f"We hope everything fits beautifully, {first_name(order)}. If anything isn't quite right, our returns window is open — see the returns policy on our site.",
                  lines_table(order), ("View your order", order_link(order)))
    await send_email(to=order["email"], subject=f"Your DRESSELLA order {order['order_number']} has been delivered", html=html, kind="order_delivered", ref=order["order_number"])


async def send_order_cancelled(order):
    paid = order.get("payment_status") in ("paid", "refunded")
    note = "Your payment will be refunded to the original payment method within 5–7 business days." if paid else "No payment was taken for this order."
    html = layout(f"Order {order['order_number']} cancelled", f"{first_name(order)}, this order has been cancelled. {note}", lines_table(order), ("View your order", order_link(order)))
    await send_email(to=order["email"], subject=f"Your DRESSELLA order {order['order_number']} has been cancelled", html=html, kind="order_cancelled", ref=order["order_number"])


async def send_order_refunded(order):
    html = layout(f"Refund issued for {order['order_number']}",
                  f"{first_name(order)}, a full refund of {inr(order['totals']['total'])} has been initiated to your original payment method. It typically appears within 5–7 business days.",
                  lines_table(order), ("View your order", order_link(order)))
    await send_email(to=order["email"], subject=f"Refund issued for DRESSELLA order {order['order_number']}", html=html, kind="order_refunded", ref=order["order_number"])


async def send_password_reset(email, name, link):
    html = layout("Reset your password",
                  f"Hello {escape((name or 'there').split(' ')[0])}. We received a request to reset the password for your DRESSELLA account. This link is valid for one hour and can be used once.",
                  f'<p style="margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.7;color:{TAUPE}">If you didn\'t request this, you can safely ignore this email — your password will not change.</p>',
                  ("Choose a new password", link))
    await send_email(to=email, subject="Reset your DRESSELLA password", html=html, kind="password_reset", ref=email)
