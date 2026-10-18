import { Link } from 'react-router-dom';
import { PageHero } from '../components/Sections.jsx';
import usePageTitle from '../lib/usePageTitle.js';

export default function Terms() {
  usePageTitle('Terms & Conditions');

  return (
    <>
      <PageHero pill="Legal" title={<>Terms &amp; <em>Conditions</em></>}>
        Last updated: 10 October 2026
      </PageHero>

      <div className="container legal">
        <nav className="legal__toc" aria-label="On this page">
          <a href="#acceptance">Acceptance of terms</a>
          <a href="#services">Our services</a>
          <a href="#accounts">Your account</a>
          <a href="#orders">Placing orders</a>
          <a href="#payments">Prices &amp; payments</a>
          <a href="#delivery">Delivery</a>
          <a href="#refunds">Cancellations &amp; refunds</a>
          <a href="#allergies">Food safety &amp; allergies</a>
          <a href="#offers">Offers &amp; promotions</a>
          <a href="#conduct">Acceptable use</a>
          <a href="#ip">Intellectual property</a>
          <a href="#liability">Limitation of liability</a>
          <a href="#law">Governing law</a>
          <a href="#changes">Changes to these terms</a>
          <a href="#contact-us">Contact us</a>
        </nav>

        <article className="legal__body">
          <h2 id="acceptance">1. Acceptance of terms</h2>
          <p>These Terms &amp; Conditions ("Terms") apply to your use of the BiteVo website, mobile app and food ordering and delivery services (together, the "Services"), operated by BiteVo ("BiteVo", "we", "us" or "our"). By accessing or using the Services, or by placing an order, you agree to these Terms and to our <Link to="/privacy">Privacy Policy</Link>. If you do not agree, please do not use the Services.</p>

          <h2 id="services">2. Our services</h2>
          <p>BiteVo prepares food in its kitchens and delivers it to customers within its service areas. Menus, dishes, prices and delivery areas may change from time to time and may differ by location. Images on our website and app are for illustration, and the actual dish may look slightly different.</p>

          <h2 id="accounts">3. Your account</h2>
          <ul>
            <li>You must be at least 18 years old, or use the Services under the supervision of a parent or guardian.</li>
            <li>You agree to give accurate information, including your name, phone number and delivery address, and to keep it up to date.</li>
            <li>You are responsible for keeping your login details safe and for all activity under your account. Tell us straight away if you think someone else has used your account.</li>
          </ul>

          <h2 id="orders">4. Placing orders</h2>
          <ul>
            <li>An order is confirmed only when you receive an order confirmation in the app, by SMS or by email.</li>
            <li>Please check your order, delivery address and contact number before you confirm. We are not responsible for delays or failed deliveries caused by incorrect details.</li>
            <li>We may decline or cancel an order, for example if an item is unavailable, the address is outside our service area, or we suspect fraud or misuse. If we cancel a paid order, you will receive a full refund.</li>
          </ul>

          <h2 id="payments">5. Prices &amp; payments</h2>
          <ul>
            <li>All prices are shown in Indian Rupees (₹) and include applicable taxes unless stated otherwise. Any delivery, packaging or other charges are shown before you pay.</li>
            <li>The price that applies is the one shown when you place your order.</li>
            <li>Payments are processed securely by our third-party payment partners using the methods shown at checkout. We do not store your full card details.</li>
          </ul>

          <h2 id="delivery">6. Delivery</h2>
          <ul>
            <li>Delivery times shown in the app are estimates. Traffic, weather, high demand and other factors may cause delays.</li>
            <li>Please make sure someone is available to receive the order at the address given. If our delivery partner cannot reach you after reasonable attempts, the order may be marked as delivered or cancelled, and a refund may not be possible.</li>
            <li>Please check your order when it arrives and contact us straight away if anything is missing, damaged or incorrect.</li>
          </ul>

          <h2 id="refunds">7. Cancellations &amp; refunds</h2>
          <h3>Cancelling an order</h3>
          <p>Because we start cooking soon after an order is placed, you can cancel free of charge only before we begin preparing it. To cancel, contact us as soon as possible on <a href="tel:+919319346656">+91 93193 46656</a>. Once preparation has started, we may not be able to cancel or refund the order.</p>
          <h3>When you may get a refund</h3>
          <ul>
            <li>We cancel your order or cannot deliver it.</li>
            <li>Items are missing, incorrect or damaged when delivered.</li>
            <li>There is a genuine quality issue with your food.</li>
          </ul>
          <p>To request a refund, contact us with your order ID and, where possible, a photo of the issue. We review every request fairly. Depending on the case, we may offer a full or partial refund or a replacement.</p>
          <h3>How refunds are paid</h3>
          <p>Approved refunds are sent to your original payment method. The time it takes for the money to reach your account depends on your bank or payment provider.</p>

          <h2 id="allergies">8. Food safety &amp; allergies</h2>
          <p>Our dishes are prepared in kitchens that handle common allergens such as milk, nuts, gluten, soy, eggs and sesame. While we take care, we cannot guarantee that any dish is completely free from allergens. If you have a food allergy or special dietary need, please check the dish details and contact us before ordering. Food should be eaten soon after delivery.</p>

          <h2 id="offers">9. Offers &amp; promotions</h2>
          <p>Discounts, coupons and offers are subject to their own terms, may be limited in time or quantity, cannot be exchanged for cash, and may be changed or withdrawn at any time. We may cancel offers that are misused.</p>

          <h2 id="conduct">10. Acceptable use</h2>
          <p>When using the Services, you agree not to:</p>
          <ul>
            <li>Place fake, fraudulent or prank orders.</li>
            <li>Misuse offers, refunds or our support channels.</li>
            <li>Abuse, threaten or harass our staff or delivery partners.</li>
            <li>Try to hack, disrupt or copy any part of our website or app.</li>
          </ul>
          <p>We may suspend or close accounts that break these rules.</p>

          <h2 id="ip">11. Intellectual property</h2>
          <p>The BiteVo name, logo, website, app, designs and content belong to BiteVo or its licensors. You may not copy, reproduce or use them without our written permission.</p>

          <h2 id="liability">12. Limitation of liability</h2>
          <p>To the extent permitted by law, BiteVo is not liable for any indirect or consequential loss arising from your use of the Services. Our total liability for any order is limited to the amount you paid for that order. Nothing in these Terms limits any rights you have under applicable consumer protection laws.</p>

          <h2 id="law">13. Governing law</h2>
          <p>These Terms are governed by the laws of India. Any dispute will first be addressed through our support team; if it cannot be resolved, it will be subject to the jurisdiction of the competent courts in India.</p>

          <h2 id="changes">14. Changes to these terms</h2>
          <p>We may update these Terms from time to time. When we do, we will change the "Last updated" date at the top of this page. By continuing to use the Services after changes take effect, you accept the updated Terms.</p>

          <h2 id="contact-us">15. Contact us</h2>
          <p>If you have any questions about these Terms, please get in touch:</p>
          <div className="legal__contact">
            <p><strong>BiteVo Support</strong></p>
            <p>Phone: <a href="tel:+919319346656">+91 93193 46656</a></p>
            <p>Email: <a href="mailto:info@bitevo.in">info@bitevo.in</a></p>
          </div>
          <p>You can also visit our <Link to="/support">Help &amp; Support</Link> page.</p>
        </article>
      </div>
    </>
  );
}
