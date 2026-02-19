import { useAppState } from './hooks/useAppState';
import { useProjectData } from './hooks/useProjectData';
import { AppShell } from './components/layout';
import { HomeView, SettingView, CreateView } from './views';
import './index.css';

function App() {
  const { currentView, setView, selectedStoryId, selectStory } = useAppState();
  const {
    stories,
    getWorkspaceCards,
    getWorkspaceTree,
    createStory,
    saveSettingCards,
    saveTreeData,
    exportProjectFile,
    importProjectFile,
    saveStatus,
    isReady,
    bootError,
  } = useProjectData();

  const handleStorySelect = (id: string) => {
    selectStory(id);
    setView('setting');
  };

  const handleCreateStory = async () => {
    const storyId = await createStory();
    selectStory(storyId);
    setView('setting');
  };

  const handleImportProject = async (file: File) => {
    try {
      await importProjectFile(file);
      selectStory(null);
      setView('home');
    } catch (error) {
      if (error instanceof Error) {
        window.alert(error.message);
      } else {
        window.alert('导入失败，请检查文件格式。');
      }
    }
  };

  const handleBackHome = () => {
    selectStory(null);
    setView('home');
  };

  const renderView = () => {
    const currentCards = getWorkspaceCards(selectedStoryId);
    const currentTree = getWorkspaceTree(selectedStoryId);

    switch (currentView) {
      case 'home':
        return (
          <HomeView
            stories={stories}
            onStorySelect={handleStorySelect}
            onCreateStory={handleCreateStory}
            onExportProject={exportProjectFile}
            onImportProject={handleImportProject}
          />
        );
      case 'setting':
        return selectedStoryId ? (
          <SettingView
            key={`setting-${selectedStoryId}`}
            cards={currentCards}
            onCardsChange={(cards) => saveSettingCards(selectedStoryId, cards)}
          />
        ) : (
          <HomeView
            stories={stories}
            onStorySelect={handleStorySelect}
            onCreateStory={handleCreateStory}
            onExportProject={exportProjectFile}
            onImportProject={handleImportProject}
          />
        );
      case 'create':
        return selectedStoryId ? (
          <CreateView
            key={`create-${selectedStoryId}`}
            treeData={currentTree}
            onTreeChange={(tree) => saveTreeData(selectedStoryId, tree)}
          />
        ) : (
          <HomeView
            stories={stories}
            onStorySelect={handleStorySelect}
            onCreateStory={handleCreateStory}
            onExportProject={exportProjectFile}
            onImportProject={handleImportProject}
          />
        );
      default:
        return (
          <HomeView
            stories={stories}
            onStorySelect={handleStorySelect}
            onCreateStory={handleCreateStory}
            onExportProject={exportProjectFile}
            onImportProject={handleImportProject}
          />
        );
    }
  };

  const getStoryTitle = () => {
    if (!selectedStoryId || currentView === 'home') {
      return undefined;
    }

    const story = stories.find((item) => item.id === selectedStoryId);
    return story?.title;
  };

  const inStoryWorkspace = Boolean(selectedStoryId && currentView !== 'home');

  if (!isReady) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontSize: '14px' }}>
        正在加载本地项目数据...
      </div>
    );
  }

  if (bootError) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px', textAlign: 'center' }}>
        <div>
          <h2 style={{ marginBottom: '8px' }}>启动失败</h2>
          <p style={{ margin: 0 }}>{bootError}</p>
        </div>
      </div>
    );
  }

  return (
    <AppShell
      currentView={currentView}
      onViewChange={setView}
      saveStatus={saveStatus}
      inStoryWorkspace={inStoryWorkspace}
      storyTitle={getStoryTitle()}
      onBackHome={handleBackHome}
    >
      {renderView()}
    </AppShell>
  );
}

export default App;
