#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum AdvancedStrategy {
    LinKernighan,
    AntColony,
}

impl AdvancedStrategy {
    fn from_code(code: u32) -> Self {
        match code {
            5 => Self::LinKernighan,
            6 => Self::AntColony,
            _ => panic!("unknown advanced search strategy: {code}"),
        }
    }
}

#[wasm_bindgen]
pub struct AdvancedSearch {
    distances: Vec<f64>,
    n: usize,
    power: f64,
    top_k: usize,
    strategy: AdvancedStrategy,
    rng: u64,
    iterations: u64,
    elite: Vec<EliteEntry>,
    aco_pheromone: Vec<f64>,
    aco_generation: Vec<(f64, Vec<usize>)>,
    aco_colony_size: usize,
}

#[wasm_bindgen]
impl AdvancedSearch {
    #[wasm_bindgen(constructor)]
    pub fn new(rgb: &[u8], power: f64, top_k: usize, seed: u32, strategy: u32) -> Self {
        validate_power(power);
        assert!(top_k > 0, "top_k must be positive");

        let colors = parse_colors(rgb);
        let n = colors.len();
        let strategy = AdvancedStrategy::from_code(strategy);
        let seed = u64::from(seed).wrapping_add(0xd1b5_4a32_d192_ed03);
        let aco_pheromone = if strategy == AdvancedStrategy::AntColony {
            vec![1.0; n * n]
        } else {
            Vec::new()
        };

        Self {
            distances: distance_matrix(&colors),
            n,
            power,
            top_k,
            strategy,
            rng: seed,
            iterations: 0,
            elite: Vec::with_capacity(top_k),
            aco_pheromone,
            aco_generation: Vec::new(),
            aco_colony_size: n.clamp(8, 32),
        }
    }

    pub fn step(&mut self, attempts: u32) -> bool {
        if self.strategy == AdvancedStrategy::AntColony {
            return self.step_ant_colony(attempts);
        }

        let mut changed = false;
        for _ in 0..attempts {
            if self.n == 0 {
                self.iterations = self.iterations.saturating_add(1);
                continue;
            }

            let mut order = self.next_candidate();
            two_opt(&self.distances, self.n, &mut order, self.power);

            match self.strategy {
                AdvancedStrategy::LinKernighan => {
                    for _ in 0..4 {
                        if !self.lk_escape(&mut order) {
                            break;
                        }
                        two_opt(&self.distances, self.n, &mut order, self.power);
                    }
                }
                AdvancedStrategy::AntColony => unreachable!("ant colony has persistent state"),
            }

            canonicalize_open_path(&mut order);
            changed |= self.consider(order);
            self.iterations = self.iterations.saturating_add(1);
        }
        changed
    }

    pub fn orders(&self) -> Vec<u32> {
        self.elite
            .iter()
            .flat_map(|entry| entry.order.iter().map(|&index| index as u32))
            .collect()
    }

    pub fn costs(&self) -> Vec<f64> {
        self.elite.iter().map(|entry| entry.cost).collect()
    }

    pub fn worst_edges(&self) -> Vec<f64> {
        self.elite
            .iter()
            .map(|entry| worst_edge_for_order(&self.distances, self.n, &entry.order))
            .collect()
    }

    pub fn elite_count(&self) -> usize {
        self.elite.len()
    }

    pub fn iterations(&self) -> f64 {
        self.iterations as f64
    }

    pub fn finished(&self) -> bool {
        false
    }
}

impl AdvancedSearch {
    fn next_u32(&mut self) -> u32 {
        let mut x = self.rng;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.rng = x;
        (x ^ (x >> 32)) as u32
    }

    fn random_unit(&mut self) -> f64 {
        (f64::from(self.next_u32()) + 0.5) / (f64::from(u32::MAX) + 1.0)
    }

    fn random_index(&mut self, upper: usize) -> usize {
        debug_assert!(upper > 0);
        self.next_u32() as usize % upper
    }

    fn random_order(&mut self) -> Vec<usize> {
        let mut order: Vec<usize> = (0..self.n).collect();
        for i in (1..self.n).rev() {
            let j = self.random_index(i + 1);
            order.swap(i, j);
        }
        order
    }

    fn perturb(&mut self, order: &mut [usize]) {
        if order.len() < 2 {
            return;
        }
        let swaps = 2 + self.random_index(4);
        for _ in 0..swaps {
            let left = self.random_index(order.len());
            let right = self.random_index(order.len());
            order.swap(left, right);
        }
    }

    fn next_candidate(&mut self) -> Vec<usize> {
        if self.iterations < self.n as u64 {
            return greedy_from_start(&self.distances, self.n, self.iterations as usize);
        }

        if self.elite.is_empty() || self.random_index(8) == 0 {
            return self.random_order();
        }

        let parent = self.random_index(self.elite.len());
        let mut order = self.elite[parent].order.clone();
        self.perturb(&mut order);
        order
    }

    /// Lin-Kernighan-inspired variable-depth escape from a 2-opt local optimum.
    ///
    /// The chain is allowed to take a mildly worsening reversal first, then keeps
    /// applying the best sampled reversal from the new state. If any prefix of
    /// the chain beats the starting tour, that best prefix is committed. This is
    /// deliberately smaller than a full LK implementation, but preserves the
    /// important variable-k idea: a sequence of individually bad moves can have
    /// a net positive gain.
    fn lk_escape(&mut self, order: &mut Vec<usize>) -> bool {
        if self.n < 4 {
            return false;
        }

        let base_energy = path_energy(&self.distances, self.n, order, self.power);
        let mut working = order.clone();
        let mut working_energy = base_energy;
        let mut best_energy = base_energy;
        let mut best_order: Option<Vec<usize>> = None;
        let mut previous_move: Option<(usize, usize)> = None;

        const MAX_DEPTH: usize = 8;
        const SAMPLES_PER_DEPTH: usize = 384;
        const MAX_EXCURSION_FRACTION: f64 = 0.015;

        for _ in 0..MAX_DEPTH {
            let mut best_move: Option<(usize, usize, f64)> = None;

            for _ in 0..SAMPLES_PER_DEPTH {
                let mut i = self.random_index(self.n);
                let mut k = self.random_index(self.n);
                if i > k {
                    std::mem::swap(&mut i, &mut k);
                }
                if i == k || (i == 0 && k + 1 == self.n) || previous_move == Some((i, k)) {
                    continue;
                }

                let delta = reversal_energy_delta(
                    &self.distances,
                    self.n,
                    &working,
                    i,
                    k,
                    self.power,
                );

                if best_move.is_none_or(|(_, _, best_delta)| delta < best_delta) {
                    best_move = Some((i, k, delta));
                }
            }

            let Some((i, k, delta)) = best_move else {
                break;
            };

            let next_energy = working_energy + delta;
            if next_energy > base_energy * (1.0 + MAX_EXCURSION_FRACTION) {
                break;
            }

            working[i..=k].reverse();
            working_energy = next_energy;
            previous_move = Some((i, k));

            if working_energy + 1e-12 < best_energy {
                best_energy = working_energy;
                best_order = Some(working.clone());
            }
        }

        if let Some(best) = best_order {
            *order = best;
            true
        } else {
            false
        }
    }

    fn construct_ant(&mut self) -> Vec<usize> {
        let mut order = Vec::with_capacity(self.n);
        let mut used = vec![false; self.n];
        let start = self.random_index(self.n);
        order.push(start);
        used[start] = true;

        while order.len() < self.n {
            let current = *order.last().expect("ant has a current node");
            let mut candidates = Vec::with_capacity(self.n - order.len());
            let mut total_weight = 0.0;

            for (candidate, is_used) in used.iter().copied().enumerate() {
                if is_used {
                    continue;
                }

                let pheromone = self.aco_pheromone[current * self.n + candidate].max(1e-6);
                let raw_distance = distance(&self.distances, self.n, current, candidate);
                let desirability = (1.0 / (raw_distance + 1e-4)).min(1e4);
                let weight = pheromone * desirability.powi(3);
                total_weight += weight;
                candidates.push((candidate, weight));
            }

            let chosen = if total_weight.is_finite() && total_weight > 0.0 {
                let target = self.random_unit() * total_weight;
                let mut cumulative = 0.0;
                let mut chosen = candidates.last().map_or(start, |&(candidate, _)| candidate);
                for &(candidate, weight) in &candidates {
                    cumulative += weight;
                    if cumulative >= target {
                        chosen = candidate;
                        break;
                    }
                }
                chosen
            } else {
                let available: Vec<usize> = used
                    .iter()
                    .enumerate()
                    .filter_map(|(index, &is_used)| (!is_used).then_some(index))
                    .collect();
                available[self.random_index(available.len())]
            };

            order.push(chosen);
            used[chosen] = true;
        }

        order
    }

    fn reinforce_ant_colony(&mut self) {
        const EVAPORATION: f64 = 0.08;
        const MIN_PHEROMONE: f64 = 0.02;
        const MAX_PHEROMONE: f64 = 100.0;

        for value in &mut self.aco_pheromone {
            *value = (*value * (1.0 - EVAPORATION)).max(MIN_PHEROMONE);
        }

        self.aco_generation
            .sort_by(|left, right| left.0.total_cmp(&right.0));
        let reinforce_count = self.aco_generation.len().min(8);
        let best_energy = self
            .aco_generation
            .first()
            .map_or(1.0, |(energy, _)| (*energy).max(1e-12));

        for rank in 0..reinforce_count {
            let (energy, order) = &self.aco_generation[rank];
            let quality = (best_energy / energy.max(1e-12)).clamp(0.0, 1.0);
            let deposit = 2.0 * quality / (rank + 1) as f64;
            for pair in order.windows(2) {
                let forward = pair[0] * self.n + pair[1];
                let reverse = pair[1] * self.n + pair[0];
                self.aco_pheromone[forward] =
                    (self.aco_pheromone[forward] + deposit).min(MAX_PHEROMONE);
                self.aco_pheromone[reverse] = self.aco_pheromone[forward];
            }
        }

        if let Some(best) = self.elite.first() {
            for pair in best.order.windows(2) {
                let forward = pair[0] * self.n + pair[1];
                let reverse = pair[1] * self.n + pair[0];
                self.aco_pheromone[forward] =
                    (self.aco_pheromone[forward] + 1.5).min(MAX_PHEROMONE);
                self.aco_pheromone[reverse] = self.aco_pheromone[forward];
            }
        }

        self.aco_generation.clear();
    }

    fn step_ant_colony(&mut self, attempts: u32) -> bool {
        let mut changed = false;
        for _ in 0..attempts {
            if self.n == 0 {
                self.iterations = self.iterations.saturating_add(1);
                continue;
            }

            let mut order = self.construct_ant();
            let energy = path_energy(&self.distances, self.n, &order, self.power);
            canonicalize_open_path(&mut order);
            changed |= self.consider(order.clone());
            self.aco_generation.push((energy, order));
            self.iterations = self.iterations.saturating_add(1);

            if self.aco_generation.len() >= self.aco_colony_size {
                self.reinforce_ant_colony();
            }
        }
        changed
    }

    fn consider(&mut self, order: Vec<usize>) -> bool {
        if self.elite.iter().any(|entry| entry.order == order) {
            return false;
        }

        let cost = cost_for_order(&self.distances, self.n, &order, self.power);
        if self.elite.len() == self.top_k
            && self.elite.last().is_some_and(|worst| cost >= worst.cost)
        {
            return false;
        }

        self.elite.push(EliteEntry { cost, order });
        self.elite
            .sort_by(|left, right| left.cost.total_cmp(&right.cost));
        self.elite.truncate(self.top_k);
        true
    }
}

#[cfg(test)]
mod advanced_tests {
    use super::*;

    const RGB6: [u8; 18] = [
        255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0, 255, 0, 255, 0, 255, 255,
    ];

    fn assert_valid_elites(search: &AdvancedSearch, n: usize) {
        assert!(!search.costs().is_empty());
        for order in search.orders().chunks_exact(n) {
            let mut sorted = order.to_vec();
            sorted.sort_unstable();
            assert_eq!(sorted, (0..n as u32).collect::<Vec<_>>());
        }
    }

    #[test]
    fn lk_search_keeps_valid_permutations() {
        let mut search = AdvancedSearch::new(&RGB6, 0.05, 4, 19, 5);
        search.step(8);
        assert_valid_elites(&search, 6);
    }

    #[test]
    fn ant_colony_keeps_valid_permutations_and_pheromone() {
        let mut search = AdvancedSearch::new(&RGB6, 0.05, 4, 23, 6);
        search.step(64);
        assert_valid_elites(&search, 6);
        assert!(
            search
                .aco_pheromone
                .iter()
                .all(|value| value.is_finite() && *value > 0.0)
        );
    }
}
