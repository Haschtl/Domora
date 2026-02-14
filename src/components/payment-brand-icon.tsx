import { FaPaypal } from "react-icons/fa";
import { SiRevolut } from "react-icons/si";

interface PaymentBrandIconProps {
  brand: "paypal" | "revolut" | "wero";
  className?: string;
}

export const PaymentBrandIcon = ({ brand, className }: PaymentBrandIconProps) => {
  if (brand === "paypal") return <FaPaypal className={className} />;
  if (brand === "revolut") return <SiRevolut className={className} />;
  return (
    <span className={className} aria-hidden="true">
      W
    </span>
  );
};
