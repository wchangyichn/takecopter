import { useAppState } from './hooks/useAppState';
import { useProjectData } from './hooks/useProjectData';
import { AppShell } from './components/layout';
import { HomeView, SettingView, CreateView, ProjectSetupView } from './views';
import { useState } from 'react';
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
    openStoryFolder,
    openStoryDatabase,
    setupState,
    pickProjectPath,
    setupProjectWithDefaultPath,
    setupProjectAtPath,
    openProjectAtPath,
    saveStatus,
    isReady,
    bootError,
  } = useProjectData();
  const [isSetupBusy, setIsSetupBusy] = useState(false);

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

  const handleOpenStoryFolder = async (storyId: string) => {
    try {
      await openStoryFolder(storyId);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '打开故事文件夹失败');
    }
  };

  const handleOpenStoryDatabase = async (storyId: string) => {
    try {
      await openStoryDatabase(storyId);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '打开故事数据库失败');
    }
  };

  const handlePickProjectPath = async () => {
    try {
      return await pickProjectPath();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '打开目录选择器失败');
      return null;
    }
  };

  const handleCreateWithDefault = async () => {
    try {
      setIsSetupBusy(true);
      await setupProjectWithDefaultPath();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '创建项目失败');
    } finally {
      setIsSetupBusy(false);
    }
  };

  const handlePickAndCreate = async () => {
    const path = await handlePickProjectPath();
    if (!path) {
      return;
    }

    try {
      setIsSetupBusy(true);
      await setupProjectAtPath(path);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '创建项目失败');
    } finally {
      setIsSetupBusy(false);
    }
  };

  const handlePickAndOpen = async () => {
    const path = await handlePickProjectPath();
    if (!path) {
      return;
    }

    try {
      setIsSetupBusy(true);
      await openProjectAtPath(path);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '导入项目目录失败，请检查目录结构后重试');
    } finally {
      setIsSetupBusy(false);
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
            onOpenStoryFolder={handleOpenStoryFolder}
            onOpenStoryDatabase={handleOpenStoryDatabase}
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
            onOpenStoryFolder={handleOpenStoryFolder}
            onOpenStoryDatabase={handleOpenStoryDatabase}
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
            onOpenStoryFolder={handleOpenStoryFolder}
            onOpenStoryDatabase={handleOpenStoryDatabase}
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
            onOpenStoryFolder={handleOpenStoryFolder}
            onOpenStoryDatabase={handleOpenStoryDatabase}
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

  if (setupState?.needsSetup) {
    return (
      <ProjectSetupView
        defaultRootPath={setupState.defaultRootPath}
        onCreateDefault={() => {
          void handleCreateWithDefault();
        }}
        onPickAndCreate={() => {
          void handlePickAndCreate();
        }}
        onPickAndOpen={() => {
          void handlePickAndOpen();
        }}
        isBusy={isSetupBusy}
      />
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
