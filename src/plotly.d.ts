declare module "plotly.js-basic-dist-min" {
  interface PlotlyApi {
    react(
      graphDiv: HTMLElement,
      data: unknown[],
      layout?: Record<string, unknown>,
      config?: Record<string, unknown>,
    ): Promise<void>;
  }

  const Plotly: PlotlyApi;
  export default Plotly;
}
