'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { ParkFeatureCollection } from '@/types';
// @ts-ignore
import * as turf from '@turf/turf';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

const BUILDING_TYPES = {
  OFFICE_TOWER: {
    colors: [
      '#e8f0f5',
      '#f5f8fa',
      '#ffffff',
      '#f0f4f7',
      '#e5ecf0',
      '#fafbfc'
    ],
    minHeight: 35,
    maxHeight: 90,
    minWidth: 0.00015,
    maxWidth: 0.0003,
    probability: 0.15,
    material: 'glass'
  },
  COMMERCIAL: {
    colors: [
      '#f5f0e8',
      '#faf5ed',
      '#ede8e0',
      '#f8f3eb',
      '#f0e8dc',
      '#fdf8f0'
    ],
    minHeight: 15,
    maxHeight: 40,
    minWidth: 0.00012,
    maxWidth: 0.00025,
    probability: 0.35,
    material: 'brick'
  },
  RESIDENTIAL: {
    colors: [
      '#faf6f0',
      '#f5f0e8', 
      '#ffffff',
      '#f8f4ec',
      '#f2ebe0',
      '#fdfbf7',
      '#ebe5dc',
      '#f9f5f0' 
    ],
    minHeight: 10,
    maxHeight: 28,
    minWidth: 0.00008,
    maxWidth: 0.00018,
    probability: 0.5,
    material: 'mixed'
  }
};

function selectBuildingType() {
  const rand = Math.random();
  if (rand < BUILDING_TYPES.OFFICE_TOWER.probability) return BUILDING_TYPES.OFFICE_TOWER;
  if (rand < BUILDING_TYPES.OFFICE_TOWER.probability + BUILDING_TYPES.COMMERCIAL.probability)
    return BUILDING_TYPES.COMMERCIAL;
  return BUILDING_TYPES.RESIDENTIAL;
}

function generateBuildingFootprints(parkGeometry: any, numBuildings: number = 30) {
  const bbox = turf.bbox(parkGeometry);
  const buildings = [];
  const existingBuildings: any[] = [];

  const bboxWidth = bbox[2] - bbox[0];
  const bboxHeight = bbox[3] - bbox[1];

  const gridSize = Math.ceil(Math.sqrt(numBuildings * 1.5));
  const cellWidth = bboxWidth / gridSize;
  const cellHeight = bboxHeight / gridSize;

  let attempts = 0;
  const maxAttempts = numBuildings * 5;

  while (buildings.length < numBuildings && attempts < maxAttempts) {
    attempts++;

    const gridX = Math.floor(Math.random() * gridSize);
    const gridY = Math.floor(Math.random() * gridSize);

    const centerLng = bbox[0] + (gridX * cellWidth) + (Math.random() * cellWidth * 0.8);
    const centerLat = bbox[1] + (gridY * cellHeight) + (Math.random() * cellHeight * 0.8);
    const center = [centerLng, centerLat];

    const point = turf.point(center);
    if (!turf.booleanPointInPolygon(point, parkGeometry)) {
      continue;
    }

    const buildingType = selectBuildingType();
    const width = buildingType.minWidth + Math.random() * (buildingType.maxWidth - buildingType.minWidth);
    const depth = buildingType.minWidth + Math.random() * (buildingType.maxWidth - buildingType.minWidth);
    const rotation = Math.random() * 45 - 22.5;
    const rotRad = (rotation * Math.PI) / 180;

    let buildingCoords;
    const shapeType = Math.random();

    if (shapeType < 0.7) {
      buildingCoords = [
        [centerLng - width/2, centerLat - depth/2],
        [centerLng + width/2, centerLat - depth/2],
        [centerLng + width/2, centerLat + depth/2],
        [centerLng - width/2, centerLat + depth/2],
        [centerLng - width/2, centerLat - depth/2]
      ];
    } else if (shapeType < 0.85) {
      const w1 = width * 0.6;
      const w2 = width * 0.4;
      const d1 = depth * 0.6;
      const d2 = depth * 0.4;
      buildingCoords = [
        [centerLng - width/2, centerLat - depth/2],
        [centerLng - width/2 + w1, centerLat - depth/2],
        [centerLng - width/2 + w1, centerLat - depth/2 + d1],
        [centerLng + width/2, centerLat - depth/2 + d1],
        [centerLng + width/2, centerLat + depth/2],
        [centerLng - width/2, centerLat + depth/2],
        [centerLng - width/2, centerLat - depth/2]
      ];
    } else {
      const offset = width * 0.15;
      buildingCoords = [
        [centerLng - width/2, centerLat - depth/2],
        [centerLng + width/2 - offset, centerLat - depth/2],
        [centerLng + width/2, centerLat - depth/2 + offset],
        [centerLng + width/2, centerLat + depth/2],
        [centerLng - width/2 + offset, centerLat + depth/2],
        [centerLng - width/2, centerLat + depth/2 - offset],
        [centerLng - width/2, centerLat - depth/2]
      ];
    }

    if (Math.abs(rotation) > 5) {
      buildingCoords = buildingCoords.map(coord => {
        const x = coord[0] - centerLng;
        const y = coord[1] - centerLat;
        return [
          centerLng + x * Math.cos(rotRad) - y * Math.sin(rotRad),
          centerLat + x * Math.sin(rotRad) + y * Math.cos(rotRad)
        ];
      });
    }
    const newBuilding = turf.polygon([buildingCoords]);
    let overlaps = false;
    for (const existing of existingBuildings) {
      try {
        const buffered = turf.buffer(existing, 0.003, { units: 'kilometers' });
        if (buffered && turf.booleanIntersects(newBuilding, buffered)) {
          overlaps = true;
          break;
        }
      } catch (e) {
        // Continue if intersection check fails
      }
    }

    if (overlaps) continue;

    const buildingHeight = buildingType.minHeight +
      Math.random() * (buildingType.maxHeight - buildingType.minHeight);

    const color = buildingType.colors[Math.floor(Math.random() * buildingType.colors.length)];

    existingBuildings.push(newBuilding);
    buildings.push({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [buildingCoords]
      },
      properties: {
        height: buildingHeight,
        base_height: 0,
        color: color,
        material: buildingType.material,
        layer: 'base',
        type: buildingType === BUILDING_TYPES.OFFICE_TOWER ? 'office' :
              buildingType === BUILDING_TYPES.COMMERCIAL ? 'commercial' : 'residential'
      }
    });

    if (buildingHeight > 25 && Math.random() > 0.4) {
      const rooftopSize = 0.5 + Math.random() * 0.3;
      const rooftopCoords = buildingCoords.map(coord => {
        const centerLng = (buildingCoords[0][0] + buildingCoords[2][0]) / 2;
        const centerLat = (buildingCoords[0][1] + buildingCoords[2][1]) / 2;
        return [
          centerLng + (coord[0] - centerLng) * rooftopSize,
          centerLat + (coord[1] - centerLat) * rooftopSize
        ];
      });

      buildings.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [rooftopCoords]
        },
        properties: {
          height: buildingHeight + 3 + Math.random() * 4,
          base_height: buildingHeight,
          color: '#e8eaed',
          material: 'metal',
          layer: 'rooftop',
          type: 'rooftop'
        }
      });
    }

    if (buildingHeight > 50 && Math.random() > 0.5) {
      const setbackHeight = buildingHeight * 0.6;
      const setbackSize = 0.7 + Math.random() * 0.2;
      const setbackCoords = buildingCoords.map(coord => {
        const centerLng = (buildingCoords[0][0] + buildingCoords[2][0]) / 2;
        const centerLat = (buildingCoords[0][1] + buildingCoords[2][1]) / 2;
        return [
          centerLng + (coord[0] - centerLng) * setbackSize,
          centerLat + (coord[1] - centerLat) * setbackSize
        ];
      });

      buildings.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [setbackCoords]
        },
        properties: {
          height: buildingHeight,
          base_height: setbackHeight,
          color: color,
          material: buildingType.material,
          layer: 'setback',
          type: buildingType === BUILDING_TYPES.OFFICE_TOWER ? 'office' :
                buildingType === BUILDING_TYPES.COMMERCIAL ? 'commercial' : 'residential'
        }
      });
    }
  }

  return {
    type: 'FeatureCollection',
    features: buildings
  };
}

interface MapViewProps {
  parks: ParkFeatureCollection | null;
  onParkClick?: (parkId: string) => void;
  selectedParkId?: string | null;
  showRemovalImpact?: boolean;
}

export default function MapView({ parks, onParkClick, selectedParkId, showRemovalImpact }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const popup = useRef<mapboxgl.Popup | null>(null);
  const hoveredParkId = useRef<string | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [showBuildings, setShowBuildings] = useState(false);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    let isMounted = true;
    const initializeMap = (center: [number, number], zoom: number) => {
      if (!isMounted || !mapContainer.current) {
        console.warn('Map container not available or component unmounted');
        return;
      }

      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/satellite-v9',
        center,
        zoom,
        attributionControl: false,
      });

      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
      map.current.addControl(
        new mapboxgl.AttributionControl({
          compact: true,
        })
      );

      map.current.on('load', () => {
        if (isMounted) {
          setIsMapLoaded(true);
        }
      });
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (isMounted) {
            initializeMap(
              [position.coords.longitude, position.coords.latitude],
              12
            );
          }
        },
        () => {
          if (isMounted) {
            initializeMap([-98, 38.5], 4);
          }
        }
      );
    } else {
      initializeMap([-98, 38.5], 4);
    }

    return () => {
      isMounted = false;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!map.current || !isMapLoaded || !parks) return;

    if (map.current.getLayer('parks-fill')) {
      map.current.removeLayer('parks-fill');
    }
    if (map.current.getLayer('parks-hover')) {
      map.current.removeLayer('parks-hover');
    }
    if (map.current.getLayer('parks-outline')) {
      map.current.removeLayer('parks-outline');
    }
    if (map.current.getLayer('parks-selected')) {
      map.current.removeLayer('parks-selected');
    }
    if (map.current.getSource('parks')) {
      map.current.removeSource('parks');
    }

    if (!parks.features || parks.features.length === 0) return;

    const validFeatures = parks.features.map((feature) => {
      let geometry = feature.geometry;
      if (typeof geometry === 'string') {
        try {
          geometry = JSON.parse(geometry);
        } catch (e) {
          console.error('Failed to parse geometry:', e);
          return null;
        }
      }

      return {
        type: 'Feature' as const,
        geometry,
        properties: {
          ...feature.properties,
          id: feature.properties.Park_id || feature.properties.gid?.toString() || feature.properties.id,
          name: feature.properties.Park_Name || feature.properties.name,
        },
      };
    }).filter((feature): feature is NonNullable<typeof feature> => {
      return (
        feature !== null &&
        feature.geometry &&
        feature.geometry.type &&
        feature.geometry.coordinates &&
        feature.properties
      );
    });

    if (validFeatures.length === 0) {
      console.error('No valid features in park data');
      console.log('Total features received:', parks.features.length);
      return;
    }

    const geojsonData = {
      type: 'FeatureCollection' as const,
      features: validFeatures,
    };

    try {
      // Add source
      map.current.addSource('parks', {
        type: 'geojson',
        data: geojsonData as any,
      });
    } catch (error) {
      console.error('Error adding GeoJSON source:', error);
      console.log('GeoJSON data:', JSON.stringify(geojsonData, null, 2));
      return;
    }

    // Add fill layer
    map.current.addLayer({
      id: 'parks-fill',
      type: 'fill',
      source: 'parks',
      paint: {
        'fill-color': [
          'case',
          ['==', ['get', 'id'], selectedParkId || ''],
          '#7dd3fc',
          '#4ade80'
        ],
        'fill-opacity': [
          'case',
          ['==', ['get', 'id'], selectedParkId || ''],
          0.8,
          0.75
        ],
      },
    });

    map.current.addLayer({
      id: 'parks-hover',
      type: 'fill',
      source: 'parks',
      paint: {
        'fill-color': [
          'case',
          ['==', ['get', 'id'], selectedParkId || ''],
          '#38bdf8',
          '#22c55e'
        ],
        'fill-opacity': 0,
      },
    });

    map.current.addLayer({
      id: 'parks-outline',
      type: 'line',
      source: 'parks',
      paint: {
        'line-color': [
          'case',
          ['==', ['get', 'id'], selectedParkId || ''],
          '#0ea5e9',
          '#22c55e'
        ],
        'line-width': [
          'case',
          ['==', ['get', 'id'], selectedParkId || ''],
          3,
          2
        ],
        'line-opacity': [
          'case',
          ['==', ['get', 'id'], selectedParkId || ''],
          1,
          0.8
        ],
      },
    });

    // Fit bounds to parks
    const bounds = new mapboxgl.LngLatBounds();
    validFeatures.forEach((feature) => {
      if (feature.geometry.type === 'Polygon') {
        feature.geometry.coordinates[0].forEach((coord: number[]) => {
          bounds.extend(coord as [number, number]);
        });
      } else if (feature.geometry.type === 'MultiPolygon') {
        feature.geometry.coordinates.forEach((polygon: number[][][]) => {
          polygon[0].forEach((coord: number[]) => {
            bounds.extend(coord as [number, number]);
          });
        });
      }
    });

    if (!bounds.isEmpty()) {
      map.current.fitBounds(bounds, { padding: 50, duration: 1000 });
    }

    // Add click handler
    const handleClick = (e: mapboxgl.MapMouseEvent) => {
      const features = map.current?.queryRenderedFeatures(e.point, {
        layers: ['parks-fill'],
      });

      if (features && features.length > 0 && onParkClick) {
        const parkId = features[0].properties?.id;
        if (parkId) {
          onParkClick(parkId);
        }
      }
    };

    map.current.on('click', 'parks-fill', handleClick);

    // Initialize popup if not already created
    if (!popup.current) {
      popup.current = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 15,
        className: 'park-info-popup'
      });
    }

    // Change cursor and show popup on hover
    const handleMouseMove = (e: mapboxgl.MapMouseEvent) => {
      const features = map.current?.queryRenderedFeatures(e.point, {
        layers: ['parks-fill'],
      });

      if (features && features.length > 0) {
        const feature = features[0];
        const properties = feature.properties;
        const currentParkId = properties?.id;

        // Update hover effect
        if (currentParkId && currentParkId !== hoveredParkId.current) {
          // Remove previous hover
          if (hoveredParkId.current) {
            map.current?.setFeatureState(
              { source: 'parks', id: hoveredParkId.current },
              { hover: false }
            );
          }

          hoveredParkId.current = currentParkId;
          map.current?.setPaintProperty('parks-hover', 'fill-opacity', [
            'case',
            ['==', ['get', 'id'], currentParkId],
            0.3,
            0
          ]);

          const parkName = properties?.Park_Name || properties?.name || 'Unknown Park';
          const parkOwner = properties?.Park_Owner || properties?.owner || properties?.Owner || 'N/A';

          console.log('Park properties:', properties);
          const address = properties?.Park_Addre ||
                         properties?.Address ||
                         properties?.address ||
                         properties?.park_addre ||
                         properties?.Street ||
                         properties?.street ||
                         properties?.street_address ||
                         properties?.STREET ||
                         properties?.ADDRESS ||
                         'N/A';

          const zipCode = properties?.Park_Zip ||
                         properties?.park_zip ||
                         properties?.Zip_Code ||
                         properties?.zip_code ||
                         properties?.zipcode ||
                         properties?.ZIP ||
                         properties?.zip ||
                         properties?.ZIPCODE ||
                         properties?.postal_code ||
                         properties?.postalcode ||
                         'N/A';

          const popupHTML = `
            <div style="padding: 12px; min-width: 220px; background: white; border-radius: 8px;">
              <div style="font-weight: 700; font-size: 15px; margin-bottom: 8px; color: #047857; border-bottom: 2px solid #d1fae5; padding-bottom: 6px;">${parkName}</div>
              <div style="font-size: 13px; line-height: 1.8; color: #374151;">
                <div style="margin-bottom: 4px; display: flex;">
                  <span style="font-weight: 600; color: #065f46; min-width: 70px;">Owner:</span>
                  <span style="color: #1f2937;">${parkOwner}</span>
                </div>
                <div style="margin-bottom: 4px; display: flex;">
                  <span style="font-weight: 600; color: #065f46; min-width: 70px;">Address:</span>
                  <span style="color: #1f2937; flex: 1;">${address}</span>
                </div>
                <div style="display: flex;">
                  <span style="font-weight: 600; color: #065f46; min-width: 70px;">Zip Code:</span>
                  <span style="color: #1f2937;">${zipCode}</span>
                </div>
              </div>
            </div>
          `;

          popup.current?.setLngLat(e.lngLat).setHTML(popupHTML).addTo(map.current!);
        } else if (popup.current?.isOpen()) {
          popup.current.setLngLat(e.lngLat);
        }
      }
    };

    map.current.on('mouseenter', 'parks-fill', (e) => {
      if (map.current) {
        map.current.getCanvas().style.cursor = 'pointer';
        handleMouseMove(e);
      }
    });

    map.current.on('mousemove', 'parks-fill', handleMouseMove);

    map.current.on('mouseleave', 'parks-fill', () => {
      if (map.current) {
        map.current.getCanvas().style.cursor = '';
        popup.current?.remove();
        hoveredParkId.current = null;

        map.current.setPaintProperty('parks-hover', 'fill-opacity', 0);
      }
    });

    return () => {
      if (map.current) {
        map.current.off('click', 'parks-fill', handleClick);
        map.current.off('mousemove', 'parks-fill', handleMouseMove);
      }
      popup.current?.remove();
    };
  }, [parks, isMapLoaded, selectedParkId, onParkClick]);

  useEffect(() => {
    if (!map.current || !isMapLoaded || !selectedParkId || !parks) return;
    if (map.current.getLayer('parks-fill')) {
      map.current.setPaintProperty('parks-fill', 'fill-opacity', [
        'case',
        ['==', ['get', 'id'], selectedParkId || ''],
        showBuildings ? 0.3 : 0.8,
        0.75
      ]);
    }
    if (map.current.getLayer('park-buildings-outline')) {
      map.current.removeLayer('park-buildings-outline');
    }
    if (map.current.getLayer('park-buildings')) {
      map.current.removeLayer('park-buildings');
    }
    if (map.current.getSource('park-buildings')) {
      map.current.removeSource('park-buildings');
    }
    if (showBuildings) {
      const selectedPark = parks.features.find((f) => {
        const featureId = f.properties.id || f.properties.Park_id || f.properties.gid?.toString();
        return featureId === selectedParkId;
      });

      if (selectedPark) {
        let geometry = selectedPark.geometry;
        if (typeof geometry === 'string') {
          try {
            geometry = JSON.parse(geometry);
          } catch (e) {
            console.error('Failed to parse geometry:', e);
            return;
          }
        }

        try {
          const parkArea = turf.area({ type: 'Feature', geometry, properties: {} });
          const areaInSqMeters = parkArea;
          const buildingsPerSqMeter = 0.002;
          const numBuildings = Math.max(40, Math.min(150, Math.floor(areaInSqMeters * buildingsPerSqMeter)));

          console.log(`Generating ${numBuildings} buildings for ${Math.floor(areaInSqMeters)} sq meter park`);

          const buildingData = generateBuildingFootprints({
            type: 'Feature',
            geometry,
            properties: {}
          }, numBuildings);

          const createBrickTexture = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 64;
            canvas.height = 64;
            const ctx = canvas.getContext('2d')!;

            ctx.fillStyle = '#f5f0e8';
            ctx.fillRect(0, 0, 64, 64);

            const brickWidth = 16;
            const brickHeight = 8;
            const mortarColor = '#e8dfd0';

            for (let y = 0; y < 64; y += brickHeight) {
              for (let x = 0; x < 64; x += brickWidth) {
                const offset = (Math.floor(y / brickHeight) % 2) * (brickWidth / 2);

                ctx.fillStyle = mortarColor;
                ctx.fillRect(x + offset - 1, y, brickWidth + 2, 1);
                ctx.fillRect(x + offset - 1, y, 1, brickHeight);

                const brickShade = Math.floor(Math.random() * 15) - 7;
                ctx.fillStyle = `rgb(${245 + brickShade}, ${240 + brickShade}, ${232 + brickShade})`;
                ctx.fillRect(x + offset + 1, y + 1, brickWidth - 2, brickHeight - 2);
              }
            }
            return canvas;
          };

          const createGlassTexture = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 64;
            canvas.height = 64;
            const ctx = canvas.getContext('2d')!;

            ctx.fillStyle = '#f0f4f7';
            ctx.fillRect(0, 0, 64, 64);

            const windowSize = 16;
            const frameWidth = 2;

            for (let y = 0; y < 64; y += windowSize) {
              for (let x = 0; x < 64; x += windowSize) {
                ctx.fillStyle = '#d8dfe5';
                ctx.fillRect(x, y, windowSize, windowSize);

                const skyReflection = Math.random();
                if (skyReflection > 0.6) {
                  ctx.fillStyle = '#e8f4fa'; 
                } else if (skyReflection > 0.3) {
                  ctx.fillStyle = '#f5f8fa';
                } else {
                  ctx.fillStyle = '#dce8f0';
                }
                ctx.fillRect(x + frameWidth, y + frameWidth, windowSize - frameWidth * 2, windowSize - frameWidth * 2);

                const gradient = ctx.createLinearGradient(x, y, x + windowSize, y + windowSize);
                gradient.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
                gradient.addColorStop(1, 'rgba(255, 255, 255, 0.1)');
                ctx.fillStyle = gradient;
                ctx.fillRect(x + frameWidth, y + frameWidth, windowSize - frameWidth * 2, windowSize - frameWidth * 2);
              }
            }
            return canvas;
          };

          const createConcreteTexture = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 64;
            canvas.height = 64;
            const ctx = canvas.getContext('2d')!;

            ctx.fillStyle = '#f5f0e8';
            ctx.fillRect(0, 0, 64, 64);

            const imageData = ctx.getImageData(0, 0, 64, 64);
            for (let i = 0; i < imageData.data.length; i += 4) {
              const noise = Math.random() * 20 - 10;
              imageData.data[i] += noise;
              imageData.data[i + 1] += noise;
              imageData.data[i + 2] += noise;
            }
            ctx.putImageData(imageData, 0, 0);

            const windowSize = 12;
            for (let y = 4; y < 64; y += windowSize + 4) {
              for (let x = 4; x < 64; x += windowSize + 4) {
                const reflection = Math.random();
                if (reflection > 0.7) {
                  ctx.fillStyle = '#d8e8f0';
                } else {
                  ctx.fillStyle = '#b8c0c8';
                }
                ctx.fillRect(x, y, windowSize, windowSize);
                ctx.strokeStyle = '#a0a8b0';
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, windowSize, windowSize);
              }
            }
            return canvas;
          };
          const brickCanvas = createBrickTexture();
          const glassCanvas = createGlassTexture();
          const concreteCanvas = createConcreteTexture();

          const brickImageData = brickCanvas.getContext('2d')!.getImageData(0, 0, 64, 64);
          const glassImageData = glassCanvas.getContext('2d')!.getImageData(0, 0, 64, 64);
          const concreteImageData = concreteCanvas.getContext('2d')!.getImageData(0, 0, 64, 64);

          const textures = [
            { name: 'brick-texture', imageData: brickImageData },
            { name: 'glass-texture', imageData: glassImageData },
            { name: 'concrete-texture', imageData: concreteImageData }
          ];

          for (const texture of textures) {
            if (!map.current.hasImage(texture.name)) {
              map.current.addImage(texture.name, texture.imageData);
            }
          }
          map.current.addSource('park-buildings', {
            type: 'geojson',
            data: buildingData as any,
          });
          map.current.addLayer({
            id: 'park-buildings',
            type: 'fill-extrusion',
            source: 'park-buildings',
            paint: {
              'fill-extrusion-color': ['get', 'color'],
              'fill-extrusion-height': ['get', 'height'],
              'fill-extrusion-base': ['get', 'base_height'],
              'fill-extrusion-opacity': 0.96,
              'fill-extrusion-pattern': [
                'case',
                ['==', ['get', 'material'], 'glass'], 'glass-texture',
                ['==', ['get', 'material'], 'brick'], 'brick-texture',
                'concrete-texture'
              ],
              'fill-extrusion-ambient-occlusion-intensity': 0.75,
              'fill-extrusion-ambient-occlusion-radius': 6,
              'fill-extrusion-vertical-gradient': true
            },
          });

          map.current.addLayer({
            id: 'park-buildings-outline',
            type: 'line',
            source: 'park-buildings',
            paint: {
              'line-color': '#1a1a1a',
              'line-width': 0.8,
              'line-opacity': 0.6,
            },
          });

          if (map.current) {
            const bounds = new mapboxgl.LngLatBounds();
            if (geometry.type === 'Polygon') {
              geometry.coordinates[0].forEach((coord: number[]) => {
                bounds.extend(coord as [number, number]);
              });
            } else if (geometry.type === 'MultiPolygon') {
              geometry.coordinates.forEach((polygon: number[][][]) => {
                polygon[0].forEach((coord: number[]) => {
                  bounds.extend(coord as [number, number]);
                });
              });
            }
            if (!bounds.isEmpty()) {
              map.current.fitBounds(bounds, { padding: 80, duration: 1000, maxZoom: 17 });

              setTimeout(() => {
                if (map.current) {
                  map.current.easeTo({
                    pitch: 65,
                    bearing: -25,
                    duration: 1800
                  });

                  map.current.setLight({
                    anchor: 'viewport',
                    color: '#fffef0',
                    intensity: 0.8,
                    position: [1.15, 210, 80]
                  });
                }
              }, 1000);
            }
          }
        } catch (error) {
          console.error('Error adding building layer:', error);
        }
      }
    } else {
      if (map.current) {
        map.current.easeTo({
          pitch: 0,
          bearing: 0,
          duration: 1000
        });

        map.current.setLight({
          anchor: 'viewport',
          color: 'white',
          intensity: 0.4,
          position: [1.15, 210, 30]
        });
      }
    }

    return () => {
      if (map.current) {
        // Remove all building layers
        if (map.current.getLayer('park-buildings-outline')) {
          map.current.removeLayer('park-buildings-outline');
        }
        if (map.current.getLayer('park-buildings')) {
          map.current.removeLayer('park-buildings');
        }
        if (map.current.getSource('park-buildings')) {
          map.current.removeSource('park-buildings');
        }

        if (map.current.getLayer('parks-fill')) {
          map.current.setPaintProperty('parks-fill', 'fill-opacity', [
            'case',
            ['==', ['get', 'id'], selectedParkId || ''],
            0.8,
            0.75
          ]);
        }

        map.current.easeTo({
          pitch: 0,
          bearing: 0,
          duration: 500
        });
      }
    };
  }, [showBuildings, selectedParkId, isMapLoaded, parks]);

  return (
    <div className="relative w-full h-full">
      {showRemovalImpact && selectedParkId && (
        <div className="absolute top-4 right-4 z-10 bg-slate-800/95 backdrop-blur-md rounded-lg shadow-2xl border border-emerald-500/30 p-1">
          <div className="flex gap-1">
            <button
              onClick={() => setShowBuildings(false)}
              className={`px-4 py-2 rounded-md text-sm font-semibold transition-all duration-200 ${
                !showBuildings
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg'
                  : 'text-gray-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              Current View
            </button>
            <button
              onClick={() => setShowBuildings(true)}
              className={`px-4 py-2 rounded-md text-sm font-semibold transition-all duration-200 ${
                showBuildings
                  ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg'
                  : 'text-gray-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              With Buildings
            </button>
          </div>
        </div>
      )}


      <div ref={mapContainer} className="w-full h-full rounded-lg overflow-hidden shadow-lg" />
      {!isMapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-lg">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading map...</p>
          </div>
        </div>
      )}
    </div>
  );
}
