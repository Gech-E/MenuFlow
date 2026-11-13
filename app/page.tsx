import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  BookOpen,
  ChefHat,
  ReceiptText,
  ScanLine,
} from "lucide-react";
import { Header, Brand } from "./components/chrome";

export default function Home() {
  return (
    <div className="site">
      <Header />
      <main id="content">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="dot" /> Restaurant ordering & management
            </p>
            <h1>
              Good service
              <br />
              starts at the <em>table.</em>
            </h1>
            <p className="lede">
              Give guests a menu they can order from. Bring your dining room,
              kitchen and cashier together in one workspace.
            </p>
            <div className="actions">
              <Link className="btn primary" href="/register">
                Create a restaurant <ArrowRight size={17} />
              </Link>
              <Link className="btn" href="/staff">
                Open staff workspace
              </Link>
            </div>
          </div>
          <div className="service-board">
            <div className="board-title">
              <span className="tiny">The service flow</span>
              <UtensilRule />
            </div>
            {[
              {
                Icon: BookOpen,
                title: "Menu",
                body: "Guests browse and order at their table.",
              },
              {
                Icon: ChefHat,
                title: "Kitchen",
                body: "Staff prepare, track and serve each order.",
              },
              {
                Icon: ReceiptText,
                title: "Checkout",
                body: "The cashier settles one itemized bill.",
              },
            ].map(({ Icon, title, body }) => (
              <div className="board-row" key={title}>
                <span className="board-icon">
                  <Icon size={25} />
                </span>
                <div>
                  <h2>{title}</h2>
                  <p>{body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="guest-prompt">
          <span className="square-icon">
            <ScanLine size={27} />
          </span>
          <div>
            <h2>Dining at a restaurant?</h2>
            <p>
              Scan the QR code on your table to open its menu. Ask your waiter
              to connect you to the table before ordering.
            </p>
          </div>
        </section>
      </main>
      <footer className="footer">
        <Brand />
        <span>Restaurant service, from menu to receipt.</span>
      </footer>
    </div>
  );
}
function UtensilRule() {
  return <BellRing size={18} aria-hidden />;
}
