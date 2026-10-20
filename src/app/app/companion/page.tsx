import type { Metadata } from "next";
import CompanionLoader from "./CompanionLoader";

export const metadata: Metadata = {
  title: "Companion Chat – Speakify",
  description: "Chat with your personalized anime AI companion who remembers you and grows with you.",
};

export default function CompanionPage() {
  return <CompanionLoader />;
}
