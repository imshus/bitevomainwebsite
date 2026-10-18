import { Link } from 'react-router-dom';
import { PageHero } from '../components/Sections.jsx';
import usePageTitle from '../lib/usePageTitle.js';

export default function NotFound() {
  usePageTitle('Page not found');

  return (
    <>
      <PageHero pill="404" title={<>Page not <em>found</em></>}>
        Sorry, we couldn't find that page. It may have moved, or the link may be wrong.
      </PageHero>
      <section className="section">
        <div className="container center" style={{ marginTop: 0 }}>
          <Link to="/" className="btn btn--red btn--lg">Back to Home</Link>
        </div>
      </section>
    </>
  );
}
