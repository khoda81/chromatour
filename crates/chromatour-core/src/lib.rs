use wasm_bindgen::prelude::*;

#[derive(Clone, Copy, Debug)]
struct Oklab {
    l: f64,
    a: f64,
    b: f64,
}

impl Oklab {
    fn distance(self, other: Self) -> f64 {
        let dl = self.l - other.l;
        let da = self.a - other.a;
        let db = self.b - other.b;
        (dl * dl + da * da + db * db).sqrt()
    }
}

#[derive(Clone, Debug)]
struct EliteEntry {
    cost: f64,
    order: Vec<usize>,
}

fn srgb_to_linear(channel: u8) -> f64 {
    let value = f64::from(channel) / 255.0;
    if value <= 0.04045 {
        value / 12.92
    } else {
        ((value + 0.055) / 1.055).powf(2.4)
    }
}

fn rgb_to_oklab(rgb: [u8; 3]) -> Oklab {
    let r = srgb_to_linear(rgb[0]);
    let g = srgb_to_linear(rgb[1]);
    let b = srgb_to_linear(rgb[2]);

    let l = 0.412_221_470_8 * r + 0.536_332_536_3 * g + 0.051_445_992_9 * b;
    let m = 0.211_903_498_2 * r + 0.680_699_545_1 * g + 0.107_396_956_6 * b;
    let s = 0.088_302_461_9 * r + 0.281_718_837_6 * g + 0.629_978_700_5 * b;

    let l = l.cbrt();
    let m = m.cbrt();
    let s = s.cbrt();

    Oklab {
        l: 0.210_454_255_3 * l + 0.793_617_785_0 * m - 0.004_072_046_8 * s,
        a: 1.977_998_495_1 * l - 2.428_592_205_0 * m + 0.450_593_709_9 * s,
        b: 0.025_904_037_1 * l + 0.782_771_766_2 * m - 0.808_675_766_0 * s,
    }
}

fn parse_colors(rgb: &[u8]) -> Vec<Oklab> {
    assert!(
        rgb.len().is_multiple_of(3),
        "RGB input length must be divisible by 3"
    );
    rgb.chunks_exact(3)
        .map(|chunk| rgb_to_oklab([chunk[0], chunk[1], chunk[2]]))
        .collect()
}

fn validate_power(power: f64) {
    assert!(
        power.is_finite() && power > 0.0,
        "objective power must be finite and positive"
    );
}

fn distance_matrix(colors: &[Oklab]) -> Vec<f64> {
    let n = colors.len();
    let mut distances = vec![0.0; n * n];
    for i in 0..n {
        for j in (i + 1)..n {
            let distance = colors[i].distance(colors[j]);
            distances[i * n + j] = distance;
            distances[j * n + i] = distance;
        }
    }
    distances
}

fn distance(distances: &[f64], n: usize, a: usize, b: usize) -> f64 {
    distances[a * n + b]
}

/// Sum `edge^power` after dividing every edge by a common scale.
///
/// The largest term is therefore exactly 1, so very large powers cannot make
/// every term underflow to zero. Smaller terms may underflow, which is fine:
/// at that power they are genuinely irrelevant compared with the maximum.
fn scaled_power_sum(edges: &[f64], scale: f64, power: f64) -> f64 {
    if scale == 0.0 {
        return 0.0;
    }

    edges.iter().map(|&edge| (edge / scale).powf(power)).sum()
}

/// Numerically stable Lp norm of the adjacent edge distances.
///
/// For a fixed positive `power`, minimizing this is exactly equivalent to
/// minimizing `sum(edge^power)`, because the outer `1 / power` root is
/// monotone. Scaling by the largest edge avoids underflow at huge powers.
fn cost_for_order(distances: &[f64], n: usize, order: &[usize], power: f64) -> f64 {
    if order.len() < 2 {
        return 0.0;
    }

    let max_edge = worst_edge_for_order(distances, n, order);
    if max_edge == 0.0 {
        return 0.0;
    }

    let scaled_sum: f64 = order
        .windows(2)
        .map(|pair| (distance(distances, n, pair[0], pair[1]) / max_edge).powf(power))
        .sum();

    max_edge * (scaled_sum.ln() / power).exp()
}

fn worst_edge_for_order(distances: &[f64], n: usize, order: &[usize]) -> f64 {
    order
        .windows(2)
        .map(|pair| distance(distances, n, pair[0], pair[1]))
        .fold(0.0, f64::max)
}

fn greedy_from_start(distances: &[f64], n: usize, start: usize) -> Vec<usize> {
    let mut order = Vec::with_capacity(n);
    let mut used = vec![false; n];
    order.push(start);
    used[start] = true;

    while order.len() < n {
        let current = *order.last().expect("tour has a start node");
        let next = (0..n)
            .filter(|&candidate| !used[candidate])
            .min_by(|&left, &right| {
                distance(distances, n, current, left)
                    .total_cmp(&distance(distances, n, current, right))
            })
            .expect("an unused node exists");
        order.push(next);
        used[next] = true;
    }

    order
}

/// Compare the changed edges of a 2-opt move without ever evaluating raw
/// `distance.powf(power)` values.
fn two_opt_move_improves(old_edges: &[f64], new_edges: &[f64], power: f64) -> bool {
    let scale = old_edges
        .iter()
        .chain(new_edges)
        .copied()
        .fold(0.0, f64::max);

    if scale == 0.0 {
        return false;
    }

    let old_cost = scaled_power_sum(old_edges, scale, power);
    let new_cost = scaled_power_sum(new_edges, scale, power);

    new_cost + 1e-15 < old_cost
}

fn two_opt(distances: &[f64], n: usize, order: &mut [usize], power: f64) {
    if n < 3 {
        return;
    }

    loop {
        let mut improved = false;

        'search: for i in 0..(n - 1) {
            for k in (i + 1)..n {
                let mut old_edges = [0.0; 2];
                let mut new_edges = [0.0; 2];
                let mut edge_count = 0;

                if i > 0 {
                    old_edges[edge_count] = distance(distances, n, order[i - 1], order[i]);
                    new_edges[edge_count] = distance(distances, n, order[i - 1], order[k]);
                    edge_count += 1;
                }
                if k + 1 < n {
                    old_edges[edge_count] = distance(distances, n, order[k], order[k + 1]);
                    new_edges[edge_count] = distance(distances, n, order[i], order[k + 1]);
                    edge_count += 1;
                }

                if two_opt_move_improves(&old_edges[..edge_count], &new_edges[..edge_count], power)
                {
                    order[i..=k].reverse();
                    improved = true;
                    break 'search;
                }
            }
        }

        if !improved {
            break;
        }
    }
}

fn canonicalize_open_path(order: &mut [usize]) {
    if order.len() > 1 && order[0] > order[order.len() - 1] {
        order.reverse();
    }
}

/// Persistent, anytime search state for the browser worker.
///
/// The first `n` attempts reproduce the multi-start greedy + 2-opt baseline.
/// After that the search keeps generating random and perturbed candidates,
/// locally optimizes them with 2-opt, and maintains the best distinct paths.
#[wasm_bindgen]
pub struct Search {
    distances: Vec<f64>,
    n: usize,
    power: f64,
    top_k: usize,
    rng: u64,
    iterations: u64,
    elite: Vec<EliteEntry>,
}

#[wasm_bindgen]
impl Search {
    #[wasm_bindgen(constructor)]
    pub fn new(rgb: &[u8], power: f64, top_k: usize, seed: u32) -> Self {
        validate_power(power);
        assert!(top_k > 0, "top_k must be positive");

        let colors = parse_colors(rgb);
        let n = colors.len();
        let seed = u64::from(seed).wrapping_add(0x9e37_79b9_7f4a_7c15);

        Self {
            distances: distance_matrix(&colors),
            n,
            power,
            top_k,
            rng: seed,
            iterations: 0,
            elite: Vec::with_capacity(top_k),
        }
    }

    /// Run more candidate attempts. Returns true if the elite set changed.
    pub fn step(&mut self, attempts: u32) -> bool {
        let mut changed = false;

        for _ in 0..attempts {
            if self.n == 0 {
                self.iterations = self.iterations.saturating_add(1);
                continue;
            }

            let mut order = self.next_candidate();
            two_opt(&self.distances, self.n, &mut order, self.power);
            canonicalize_open_path(&mut order);
            changed |= self.consider(order);
            self.iterations = self.iterations.saturating_add(1);
        }

        changed
    }

    /// Elite orders flattened as `[tour0..., tour1..., ...]`, sorted best first.
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
}

impl Search {
    fn next_u32(&mut self) -> u32 {
        let mut x = self.rng;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.rng = x;
        (x ^ (x >> 32)) as u32
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

/// Baseline open Hamiltonian-path solver.
///
/// This tries greedy tours from every start node and then applies 2-opt.
#[wasm_bindgen]
pub fn solve_baseline(rgb: &[u8], power: f64) -> Vec<u32> {
    validate_power(power);
    let colors = parse_colors(rgb);
    let n = colors.len();
    if n <= 1 {
        return (0..n as u32).collect();
    }

    let distances = distance_matrix(&colors);
    let mut best_order = Vec::new();
    let mut best_cost = f64::INFINITY;

    for start in 0..n {
        let mut order = greedy_from_start(&distances, n, start);
        two_opt(&distances, n, &mut order, power);
        let cost = cost_for_order(&distances, n, &order, power);
        if cost < best_cost {
            best_cost = cost;
            best_order = order;
        }
    }

    canonicalize_open_path(&mut best_order);
    best_order.into_iter().map(|index| index as u32).collect()
}

/// Lp norm of adjacent OKLab distances for an open path.
///
/// This is a monotone transform of `sum(distance^power)`, so it has exactly the
/// same optimum while remaining numerically stable at very large powers.
#[wasm_bindgen]
pub fn tour_cost(rgb: &[u8], order: &[u32], power: f64) -> f64 {
    validate_power(power);
    let colors = parse_colors(rgb);
    assert_eq!(
        colors.len(),
        order.len(),
        "order length must match color count"
    );
    let n = colors.len();
    let distances = distance_matrix(&colors);
    let order: Vec<usize> = order.iter().map(|&index| index as usize).collect();
    assert!(
        order.iter().all(|&index| index < n),
        "tour index out of bounds"
    );
    cost_for_order(&distances, n, &order, power)
}

/// Largest raw adjacent OKLab distance in an open path.
#[wasm_bindgen]
pub fn tour_worst_edge(rgb: &[u8], order: &[u32]) -> f64 {
    let colors = parse_colors(rgb);
    assert_eq!(
        colors.len(),
        order.len(),
        "order length must match color count"
    );
    let n = colors.len();
    if n < 2 {
        return 0.0;
    }
    let distances = distance_matrix(&colors);

    order
        .windows(2)
        .map(|pair| {
            let a = pair[0] as usize;
            let b = pair[1] as usize;
            assert!(a < n && b < n, "tour index out of bounds");
            distance(&distances, n, a, b)
        })
        .fold(0.0, f64::max)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identical_colors_have_zero_distance() {
        let color = rgb_to_oklab([123, 45, 67]);
        assert_eq!(color.distance(color), 0.0);
    }

    #[test]
    fn baseline_returns_a_permutation() {
        let rgb = [255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255];
        let order = solve_baseline(&rgb, 2.0);
        let mut sorted = order.clone();
        sorted.sort_unstable();
        assert_eq!(sorted, vec![0, 1, 2, 3]);
    }

    #[test]
    fn continuous_search_returns_ranked_elites() {
        let rgb = [255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0, 255, 0, 255];
        let mut search = Search::new(&rgb, 2.0, 3, 7);
        assert!(search.step(12));
        let costs = search.costs();
        assert!(!costs.is_empty());
        assert!(costs.windows(2).all(|pair| pair[0] <= pair[1]));
    }

    #[test]
    fn power_two_penalizes_one_large_jump() {
        let lp = |edges: &[f64]| edges.iter().map(|d| d.powi(2)).sum::<f64>().sqrt();
        let balanced = [0.4_f64, 0.4, 0.4, 0.4];
        let spiky = [0.2_f64, 0.2, 0.2, 1.0];
        assert!(lp(&balanced) < lp(&spiky));
    }

    #[test]
    fn high_power_cost_does_not_underflow() {
        let rgb = [0, 0, 0, 64, 32, 16, 128, 128, 128, 255, 255, 255];
        let order = [0, 1, 2, 3];
        let cost = tour_cost(&rgb, &order, 1_000_000.0);
        let worst = tour_worst_edge(&rgb, &order);

        assert!(cost.is_finite());
        assert!(cost > 0.0);
        assert!(cost >= worst);
        assert!((cost - worst) < 1e-5);
    }

    #[test]
    fn huge_power_still_distinguishes_changed_max_edges() {
        let old = [0.58, 0.20];
        let new = [0.57, 0.30];
        assert!(two_opt_move_improves(&old, &new, 1_000_000.0));
    }

    #[test]
    fn objective_is_an_open_path() {
        let rgb = [0, 0, 0, 127, 127, 127, 255, 255, 255];
        let order = [0, 1, 2];
        let colors = parse_colors(&rgb);
        let direct_end_to_end = colors[0].distance(colors[2]);
        assert!(
            tour_cost(&rgb, &order, 2.0)
                < (tour_cost(&rgb, &order, 2.0).powi(2) + direct_end_to_end.powi(2)).sqrt()
        );
    }
}
