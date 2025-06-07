import { PageContainer } from "../components/PageContainer";

export default function Analytics() {
  return (
    <PageContainer title="Analytics">
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="text-lg font-semibold mb-2">Total Users</h3>
          <p className="text-3xl font-bold text-blue-600">1,234</p>
          <p className="text-sm text-gray-500">+12% from last month</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="text-lg font-semibold mb-2">Active Sessions</h3>
          <p className="text-3xl font-bold text-green-600">567</p>
          <p className="text-sm text-gray-500">+8% from last month</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="text-lg font-semibold mb-2">API Calls</h3>
          <p className="text-3xl font-bold text-purple-600">98,765</p>
          <p className="text-sm text-gray-500">+15% from last month</p>
        </div>
      </div>
      
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h2 className="text-xl font-semibold mb-4">Usage Analytics</h2>
        <p className="text-gray-600">
          Analytics dashboard content would go here. This could include charts, 
          graphs, and detailed metrics about system usage and performance.
        </p>
      </div>
    </PageContainer>
  );
}