# Deutsche Bahn Digital Twin - AI Coding Instructions

## Project Architecture

This is a **dual-architecture project** combining Python data processing with a TypeScript React dashboard:

### Data Pipeline (Python)
- **Main workflow**: `download_data.sh` → `parquet_to_csv.py` → `prep_months.py` → analysis scripts
- **Analysis engine**: Modular calculations in `questions/*/calculations.py` executed by `run_all_calculations.py` 
- **ML component**: `data_process_and_ml_stuff/train_and_export_model.py` generates `tree_model.js` for frontend
- **Event transformation**: Raw journey data → split events (ARRIVAL/DEPARTURE/CANCELLATION) via `data_structure_desc.md` schema

### Dashboard (TypeScript + React)
- **State management**: Zustand stores in `dashboard/src/state/` - notably `useEventStream`, `useJourneys`, `useGraphStructure`
- **Real-time simulation**: Time-based event streaming with `DataLoader` component auto-loading CSV on mount
- **ML integration**: Import `tree_model.js` in `mlPrediction.ts` for delay predictions in the browser

## Key Development Patterns

### Python Environment
- Use `uv` package manager (see `pyproject.toml`)
- Run calculations: `uv run run_all_calculations.py` 
- Code style: Ruff with 110 char line length, double quotes

### Dashboard Development
```bash
cd dashboard
npm install  # Node.js 22 required
npm run dev  # Vite dev server
```

### Event Data Flow
1. Raw Deutsche Bahn parquet files → CSV conversion
2. Journey events split into timestamped ARRIVAL/DEPARTURE/CANCELLATION events
3. Frontend `useEventStream` loads CSV, `useJourneys` computes live journey states
4. Real-time visualization updates based on timeline position

### State Management Convention
- **Zustand patterns**: Stores expose both state and actions, use `create<State>()()`
- **Event processing**: `useJourneys` maintains optimized ride cache with sliding window for performance
- **Graph data**: Station coordinates and network topology loaded once in `useGraphStructure`

## Critical Integration Points

- **ML Pipeline**: Python training → JS model export → TypeScript prediction integration
- **Data synchronization**: Monthly GitHub Actions workflow updates `questions/*/data/` JSON files
- **Component communication**: React components consume Zustand state, no prop drilling for simulation data
- **Time coordination**: All components sync to `useSimStore` timeline for consistent visualization

## File Naming Conventions
- Analysis outputs: `questions/[category]/data/[metric].json`
- Event files: `events-YYYY-MM.csv` format after processing
- Station mappings: `alternative_station_name_to_station_name.json` for name normalization

When working on this codebase, always consider the data flow from Python processing to TypeScript visualization, and maintain the modular analysis structure in the `questions/` directory.