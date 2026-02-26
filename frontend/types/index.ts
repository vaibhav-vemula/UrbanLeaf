export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  data?: any;
  action?: string;
  showProfileButton?: boolean;
}

export interface ParkFeature {
  type: 'Feature';
  geometry: {
    type: string;
    coordinates: any;
  };
  properties: {
    id: string;
    name?: string;
    [key: string]: any;
  };
}

export interface ParkFeatureCollection {
  type: 'FeatureCollection';
  features: ParkFeature[];
}

export interface AgentResponse {
  sessionId: string;
  action: string;
  reply: string;
  showProfileButton?: boolean;
  hcsTopicId?: string;
  data?: {
    featureCollection?: ParkFeatureCollection;
    [key: string]: any;
  };
}
