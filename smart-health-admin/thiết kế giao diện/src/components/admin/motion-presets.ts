import type { Variants } from "framer-motion";

const easeOut = "easeOut" as const;

export const pageMotion = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.28, ease: easeOut },
};

export const listMotion: Variants = {
  hidden: { opacity: 1 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.055, delayChildren: 0.04 },
  },
};

export const itemMotion: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.24, ease: easeOut } },
};
