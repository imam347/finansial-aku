import { initials } from "@/lib/format";
import Image from "next/image";

export function UserAvatar({ name, src, className = "avatar" }: { name: string; src?: string; className?: string }) {
  return (
    <span className={className} aria-hidden="true">
      {src ? <Image src={src} alt="" width={64} height={64} unoptimized /> : initials(name)}
    </span>
  );
}
