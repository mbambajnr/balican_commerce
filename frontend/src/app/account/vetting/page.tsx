import { Metadata } from "next";
import VettingFormPage from "./vetting-page-client";

export const metadata: Metadata = {
  title: "Business Profile",
  description: "Complete your business profile for Bali-Can Limited",
};

export default function Page() {
  return <VettingFormPage />;
}
