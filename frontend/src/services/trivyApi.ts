import axios from 'axios';

const API_BASE = 'http://localhost:8000/api/v1';

export const trivyApi = {
  // Docker Image Vulnerability Scanning with Trivy
  async getAvailableDockerImages(): Promise<any> {
    try {
      const response = await axios.get(`${API_BASE}/docker/images`);
      return response.data;
    } catch (error) {
      console.error('Error fetching Docker images:', error);
      return { status: 'error', images: [] };
    }
  },

  async scanImageVulnerabilities(imageId: string): Promise<any> {
    try {
      // Use POST instead of GET to handle image names with special characters (@sha256:...)
      const response = await axios.post(`${API_BASE}/docker/image/scan`, {
        image_name: imageId
      });
      return response.data;
    } catch (error) {
      console.error(`Error scanning image ${imageId}:`, error);
      return { status: 'error', message: 'Failed to scan image' };
    }
  },

  async scanImageByName(imageName: string): Promise<any> {
    try {
      const response = await axios.post(`${API_BASE}/docker/image/scan`, {
        image_name: imageName
      });
      return response.data;
    } catch (error) {
      console.error(`Error scanning image ${imageName}:`, error);
      return { status: 'error', message: 'Failed to scan image' };
    }
  }
};
