export function calculateEffectiveCapacity({
  serverCapacityMultiplier = 1,
  loadBalancingEnabled = false,
  loadBalancingMultiplier = 1
} = {}) {
  const effectiveCapacityMultiplier = loadBalancingEnabled
    ? serverCapacityMultiplier * loadBalancingMultiplier
    : serverCapacityMultiplier;

  return {
    effectiveCapacityMultiplier,
    loadBalancingApplied: loadBalancingEnabled
  };
}
