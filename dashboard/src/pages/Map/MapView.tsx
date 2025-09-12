import { Map, NavigationControl } from '@vis.gl/react-maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

export default function MapView() {
    return (
        <div className="map-view">
            <Map
                initialViewState={{
                    longitude: 10,
                    latitude: 51,
                    zoom: 5,
                }}
                mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
            >
                <NavigationControl position="top-right" />
            </Map>
        </div>
    );
}