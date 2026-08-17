export const pageVariants = {
  initial: { opacity: 0, y: 8, scale: 0.995 },
  in: { opacity: 1, y: 0, scale: 1 },
  out: { opacity: 0, y: -8, scale: 0.995 },
};

export const pageTransition = {
  duration: 0.22,
  ease: [0.22, 0.8, 0.2, 1],
};

export const motionProps = {
  whileHover: { y: -2, scale: 1.01 },
  whileTap: { scale: 0.985 },
  transition: { duration: 0.12, ease: [0.2, 0.8, 0.2, 1] },
};
