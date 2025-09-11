import ready from 'domready';
import WebGLView from './webgl/WebGLView';
import App from './App';

ready(() => {
	window.app = new App();
	window.app.init();
});
