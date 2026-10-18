import { Link } from 'react-router-dom';
import { PageHero } from '../components/Sections.jsx';
import usePageTitle from '../lib/usePageTitle.js';

export default function Privacy() {
  usePageTitle('Privacy Policy');

  return (
    <>
      <PageHero pill="Legal" title={<>Privacy <em>Policy</em></>}>
        Last updated: 10 October 2026
      </PageHero>

      <div className="container legal">
        <nav className="legal__toc" aria-label="On this page">
          <a href="#intro">Introduction</a>
          <a href="#collect">Information we collect</a>
          <a href="#use">How we use it</a>
          <a href="#share">Sharing your information</a>
          <a href="#cookies">Cookies</a>
          <a href="#retention">Data retention</a>
          <a href="#security">Security</a>
          <a href="#rights">Your rights</a>
          <a href="#children">Children</a>
          <a href="#links">Third-party links</a>
          <a href="#changes">Changes to this policy</a>
          <a href="#contact-us">Contact &amp; grievances</a>
        </nav>

        <article className="legal__body">
          <h2 id="intro">1. Introduction</h2>
          <p>BiteVo ("BiteVo", "we", "us" or "our") respects your privacy. This Privacy Policy explains what personal information we collect when you use our website, mobile app and food ordering and delivery services (together, the "Services"), how we use it, who we share it with, and the choices you have.</p>
          <p>By using the Services, you agree to the collection and use of your information as described in this policy. If you do not agree, please do not use the Services.</p>

          <h2 id="collect">2. Information we collect</h2>
          <h3>Information you give us</h3>
          <ul>
            <li><strong>Account details</strong> — your name, mobile number and email address.</li>
            <li><strong>Delivery details</strong> — your delivery address(es) and any delivery instructions.</li>
            <li><strong>Order details</strong> — the items you order, your preferences, and your order history.</li>
            <li><strong>Support communications</strong> — messages, call details, photos or feedback you send us.</li>
          </ul>
          <h3>Information collected automatically</h3>
          <ul>
            <li><strong>Device and usage data</strong> — device type, operating system, app version, IP address, and how you use the Services.</li>
            <li><strong>Location</strong> — with your permission, your device location, used to find your address and deliver your order. You can turn this off in your device settings.</li>
          </ul>
          <h3>Payment information</h3>
          <p>Payments are processed by secure third-party payment providers. We do not store your full card number, CVV or UPI PIN. We only receive limited details needed to confirm the payment, such as a transaction reference and payment status.</p>

          <h2 id="use">3. How we use your information</h2>
          <ul>
            <li>To create and manage your account.</li>
            <li>To take, prepare, deliver and confirm your orders.</li>
            <li>To process payments and refunds.</li>
            <li>To send order updates by SMS, email, phone call or app notification.</li>
            <li>To respond to your questions, complaints and support requests.</li>
            <li>To improve our food, Services, app and website.</li>
            <li>To prevent fraud and misuse, and to keep our Services safe.</li>
            <li>To send you offers and updates, where you have agreed to receive them. You can opt out at any time.</li>
            <li>To meet our legal and regulatory obligations.</li>
          </ul>

          <h2 id="share">4. Sharing your information</h2>
          <p>We do not sell your personal information. We share it only where needed to provide the Services:</p>
          <ul>
            <li><strong>Delivery partners</strong> — your name, phone number and delivery address, so your order can reach you.</li>
            <li><strong>Payment providers</strong> — to process your payments and refunds securely.</li>
            <li><strong>Service providers</strong> — companies that help us with hosting, SMS and email, customer support and analytics, under confidentiality obligations.</li>
            <li><strong>Legal requirements</strong> — government or law enforcement authorities when required by law, or to protect the rights and safety of BiteVo, our customers or others.</li>
            <li><strong>Business changes</strong> — if BiteVo is involved in a merger, acquisition or sale of assets, your information may be transferred as part of that transaction.</li>
          </ul>

          <h2 id="cookies">5. Cookies</h2>
          <p>Our website may use cookies and similar technologies to keep it working properly, remember your preferences and understand how visitors use it. You can block or delete cookies in your browser settings, though some parts of the website may not work as well without them.</p>

          <h2 id="retention">6. Data retention</h2>
          <p>We keep your personal information only for as long as your account is active or as needed to provide the Services, resolve disputes, and meet our legal, tax and accounting obligations. When it is no longer needed, we delete or anonymise it.</p>

          <h2 id="security">7. Security</h2>
          <p>We use reasonable technical and organisational measures to protect your information from unauthorised access, loss or misuse. However, no method of transmission or storage is completely secure, so we cannot guarantee absolute security.</p>

          <h2 id="rights">8. Your rights</h2>
          <p>Subject to applicable law, including the Digital Personal Data Protection Act, 2023, you can:</p>
          <ul>
            <li>Ask for a summary of the personal information we hold about you.</li>
            <li>Correct or update information that is inaccurate or incomplete.</li>
            <li>Ask us to delete your account and personal information.</li>
            <li>Withdraw your consent, for example to marketing messages.</li>
            <li>Raise a grievance about how we handle your information.</li>
          </ul>
          <p>To use any of these rights, contact us using the details below. We may need to verify your identity before acting on your request.</p>

          <h2 id="children">9. Children</h2>
          <p>Our Services are meant for users aged 18 and above. We do not knowingly collect personal information from children without verifiable consent from a parent or guardian. If you believe a child has shared information with us, please contact us and we will delete it.</p>

          <h2 id="links">10. Third-party links</h2>
          <p>Our website or app may link to third-party websites or services, such as app stores and social media. We are not responsible for their privacy practices, so please read their privacy policies.</p>

          <h2 id="changes">11. Changes to this policy</h2>
          <p>We may update this Privacy Policy from time to time. When we do, we will change the "Last updated" date at the top of this page and, for significant changes, let you know through the app or by email.</p>

          <h2 id="contact-us">12. Contact &amp; grievances</h2>
          <p>If you have any questions, requests or complaints about this Privacy Policy or your personal information, please contact our Grievance Officer:</p>
          <div className="legal__contact">
            <p><strong>Grievance Officer, BiteVo</strong></p>
            <p>Phone: <a href="tel:+919319346656">+91 93193 46656</a></p>
            <p>Email: <a href="mailto:info@bitevo.in">info@bitevo.in</a></p>
          </div>
          <p>You can also visit our <Link to="/support">Help &amp; Support</Link> page.</p>
        </article>
      </div>
    </>
  );
}
