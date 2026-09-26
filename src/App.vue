<script setup>
import HomePage from './pages/HomePage.vue'
import NavBar from './components/NavBar.vue'
import Features from "./pages/Features.vue";
import UpdateLog from "./pages/UpdateLog.vue";
import ProjectInfo from "./pages/ProjectInfo.vue";
</script>

<template>
  <NavBar />
<!--  <HomePage />-->
<!--  <Features/>-->
<!--  <UpdateLog/>-->
  <ProjectInfo/>
</template>

<style>
body {
  margin: 0;
  font-family: 'HarmonyOS Sans SC', 'Arial', system-ui;
}
</style>
