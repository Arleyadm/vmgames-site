import{r as f,j as v}from"./index-B8sD1N4P.js";import{n as de,I as fe,F,o as H,p as z,W as ue,q as G,r as ie,V as E,s as pe,U as q,t as k,b as se,M as me,v as B,w as he,x as ve,y as ge,u as oe,i as ye,_ as W,E as xe,e as we,D as Se,f as be,z as Ee,G as $,H as J,J as X}from"./OrbitControls-DS6eegjx.js";const re=parseInt(de.replace(/\D+/g,"")),ae=re>=125?"uv1":"uv2",Y=new G,O=new E;class N extends fe{constructor(){super(),this.isLineSegmentsGeometry=!0,this.type="LineSegmentsGeometry";const e=[-1,2,0,1,2,0,-1,1,0,1,1,0,-1,0,0,1,0,0,-1,-1,0,1,-1,0],n=[-1,2,1,2,-1,1,1,1,-1,-1,1,-1,-1,-2,1,-2],s=[0,2,1,2,3,1,2,4,3,4,5,3,4,6,5,6,7,5];this.setIndex(s),this.setAttribute("position",new F(e,3)),this.setAttribute("uv",new F(n,2))}applyMatrix4(e){const n=this.attributes.instanceStart,s=this.attributes.instanceEnd;return n!==void 0&&(n.applyMatrix4(e),s.applyMatrix4(e),n.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this}setPositions(e){let n;e instanceof Float32Array?n=e:Array.isArray(e)&&(n=new Float32Array(e));const s=new H(n,6,1);return this.setAttribute("instanceStart",new z(s,3,0)),this.setAttribute("instanceEnd",new z(s,3,3)),this.computeBoundingBox(),this.computeBoundingSphere(),this}setColors(e,n=3){let s;e instanceof Float32Array?s=e:Array.isArray(e)&&(s=new Float32Array(e));const i=new H(s,n*2,1);return this.setAttribute("instanceColorStart",new z(i,n,0)),this.setAttribute("instanceColorEnd",new z(i,n,n)),this}fromWireframeGeometry(e){return this.setPositions(e.attributes.position.array),this}fromEdgesGeometry(e){return this.setPositions(e.attributes.position.array),this}fromMesh(e){return this.fromWireframeGeometry(new ue(e.geometry)),this}fromLineSegments(e){const n=e.geometry;return this.setPositions(n.attributes.position.array),this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new G);const e=this.attributes.instanceStart,n=this.attributes.instanceEnd;e!==void 0&&n!==void 0&&(this.boundingBox.setFromBufferAttribute(e),Y.setFromBufferAttribute(n),this.boundingBox.union(Y))}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new ie),this.boundingBox===null&&this.computeBoundingBox();const e=this.attributes.instanceStart,n=this.attributes.instanceEnd;if(e!==void 0&&n!==void 0){const s=this.boundingSphere.center;this.boundingBox.getCenter(s);let i=0;for(let o=0,a=e.count;o<a;o++)O.fromBufferAttribute(e,o),i=Math.max(i,s.distanceToSquared(O)),O.fromBufferAttribute(n,o),i=Math.max(i,s.distanceToSquared(O));this.boundingSphere.radius=Math.sqrt(i),isNaN(this.boundingSphere.radius)&&console.error("THREE.LineSegmentsGeometry.computeBoundingSphere(): Computed radius is NaN. The instanced position data is likely to have NaN values.",this)}}toJSON(){}applyMatrix(e){return console.warn("THREE.LineSegmentsGeometry: applyMatrix() has been renamed to applyMatrix4()."),this.applyMatrix4(e)}}class le extends N{constructor(){super(),this.isLineGeometry=!0,this.type="LineGeometry"}setPositions(e){const n=e.length-3,s=new Float32Array(2*n);for(let i=0;i<n;i+=3)s[2*i]=e[i],s[2*i+1]=e[i+1],s[2*i+2]=e[i+2],s[2*i+3]=e[i+3],s[2*i+4]=e[i+4],s[2*i+5]=e[i+5];return super.setPositions(s),this}setColors(e,n=3){const s=e.length-n,i=new Float32Array(2*s);if(n===3)for(let o=0;o<s;o+=n)i[2*o]=e[o],i[2*o+1]=e[o+1],i[2*o+2]=e[o+2],i[2*o+3]=e[o+3],i[2*o+4]=e[o+4],i[2*o+5]=e[o+5];else for(let o=0;o<s;o+=n)i[2*o]=e[o],i[2*o+1]=e[o+1],i[2*o+2]=e[o+2],i[2*o+3]=e[o+3],i[2*o+4]=e[o+4],i[2*o+5]=e[o+5],i[2*o+6]=e[o+6],i[2*o+7]=e[o+7];return super.setColors(i,n),this}fromLine(e){const n=e.geometry;return this.setPositions(n.attributes.position.array),this}}class V extends pe{constructor(e){super({type:"LineMaterial",uniforms:q.clone(q.merge([k.common,k.fog,{worldUnits:{value:1},linewidth:{value:1},resolution:{value:new se(1,1)},dashOffset:{value:0},dashScale:{value:1},dashSize:{value:1},gapSize:{value:1}}])),vertexShader:`
				#include <common>
				#include <fog_pars_vertex>
				#include <logdepthbuf_pars_vertex>
				#include <clipping_planes_pars_vertex>

				uniform float linewidth;
				uniform vec2 resolution;

				attribute vec3 instanceStart;
				attribute vec3 instanceEnd;

				#ifdef USE_COLOR
					#ifdef USE_LINE_COLOR_ALPHA
						varying vec4 vLineColor;
						attribute vec4 instanceColorStart;
						attribute vec4 instanceColorEnd;
					#else
						varying vec3 vLineColor;
						attribute vec3 instanceColorStart;
						attribute vec3 instanceColorEnd;
					#endif
				#endif

				#ifdef WORLD_UNITS

					varying vec4 worldPos;
					varying vec3 worldStart;
					varying vec3 worldEnd;

					#ifdef USE_DASH

						varying vec2 vUv;

					#endif

				#else

					varying vec2 vUv;

				#endif

				#ifdef USE_DASH

					uniform float dashScale;
					attribute float instanceDistanceStart;
					attribute float instanceDistanceEnd;
					varying float vLineDistance;

				#endif

				void trimSegment( const in vec4 start, inout vec4 end ) {

					// trim end segment so it terminates between the camera plane and the near plane

					// conservative estimate of the near plane
					float a = projectionMatrix[ 2 ][ 2 ]; // 3nd entry in 3th column
					float b = projectionMatrix[ 3 ][ 2 ]; // 3nd entry in 4th column
					float nearEstimate = - 0.5 * b / a;

					float alpha = ( nearEstimate - start.z ) / ( end.z - start.z );

					end.xyz = mix( start.xyz, end.xyz, alpha );

				}

				void main() {

					#ifdef USE_COLOR

						vLineColor = ( position.y < 0.5 ) ? instanceColorStart : instanceColorEnd;

					#endif

					#ifdef USE_DASH

						vLineDistance = ( position.y < 0.5 ) ? dashScale * instanceDistanceStart : dashScale * instanceDistanceEnd;
						vUv = uv;

					#endif

					float aspect = resolution.x / resolution.y;

					// camera space
					vec4 start = modelViewMatrix * vec4( instanceStart, 1.0 );
					vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );

					#ifdef WORLD_UNITS

						worldStart = start.xyz;
						worldEnd = end.xyz;

					#else

						vUv = uv;

					#endif

					// special case for perspective projection, and segments that terminate either in, or behind, the camera plane
					// clearly the gpu firmware has a way of addressing this issue when projecting into ndc space
					// but we need to perform ndc-space calculations in the shader, so we must address this issue directly
					// perhaps there is a more elegant solution -- WestLangley

					bool perspective = ( projectionMatrix[ 2 ][ 3 ] == - 1.0 ); // 4th entry in the 3rd column

					if ( perspective ) {

						if ( start.z < 0.0 && end.z >= 0.0 ) {

							trimSegment( start, end );

						} else if ( end.z < 0.0 && start.z >= 0.0 ) {

							trimSegment( end, start );

						}

					}

					// clip space
					vec4 clipStart = projectionMatrix * start;
					vec4 clipEnd = projectionMatrix * end;

					// ndc space
					vec3 ndcStart = clipStart.xyz / clipStart.w;
					vec3 ndcEnd = clipEnd.xyz / clipEnd.w;

					// direction
					vec2 dir = ndcEnd.xy - ndcStart.xy;

					// account for clip-space aspect ratio
					dir.x *= aspect;
					dir = normalize( dir );

					#ifdef WORLD_UNITS

						// get the offset direction as perpendicular to the view vector
						vec3 worldDir = normalize( end.xyz - start.xyz );
						vec3 offset;
						if ( position.y < 0.5 ) {

							offset = normalize( cross( start.xyz, worldDir ) );

						} else {

							offset = normalize( cross( end.xyz, worldDir ) );

						}

						// sign flip
						if ( position.x < 0.0 ) offset *= - 1.0;

						float forwardOffset = dot( worldDir, vec3( 0.0, 0.0, 1.0 ) );

						// don't extend the line if we're rendering dashes because we
						// won't be rendering the endcaps
						#ifndef USE_DASH

							// extend the line bounds to encompass  endcaps
							start.xyz += - worldDir * linewidth * 0.5;
							end.xyz += worldDir * linewidth * 0.5;

							// shift the position of the quad so it hugs the forward edge of the line
							offset.xy -= dir * forwardOffset;
							offset.z += 0.5;

						#endif

						// endcaps
						if ( position.y > 1.0 || position.y < 0.0 ) {

							offset.xy += dir * 2.0 * forwardOffset;

						}

						// adjust for linewidth
						offset *= linewidth * 0.5;

						// set the world position
						worldPos = ( position.y < 0.5 ) ? start : end;
						worldPos.xyz += offset;

						// project the worldpos
						vec4 clip = projectionMatrix * worldPos;

						// shift the depth of the projected points so the line
						// segments overlap neatly
						vec3 clipPose = ( position.y < 0.5 ) ? ndcStart : ndcEnd;
						clip.z = clipPose.z * clip.w;

					#else

						vec2 offset = vec2( dir.y, - dir.x );
						// undo aspect ratio adjustment
						dir.x /= aspect;
						offset.x /= aspect;

						// sign flip
						if ( position.x < 0.0 ) offset *= - 1.0;

						// endcaps
						if ( position.y < 0.0 ) {

							offset += - dir;

						} else if ( position.y > 1.0 ) {

							offset += dir;

						}

						// adjust for linewidth
						offset *= linewidth;

						// adjust for clip-space to screen-space conversion // maybe resolution should be based on viewport ...
						offset /= resolution.y;

						// select end
						vec4 clip = ( position.y < 0.5 ) ? clipStart : clipEnd;

						// back to clip space
						offset *= clip.w;

						clip.xy += offset;

					#endif

					gl_Position = clip;

					vec4 mvPosition = ( position.y < 0.5 ) ? start : end; // this is an approximation

					#include <logdepthbuf_vertex>
					#include <clipping_planes_vertex>
					#include <fog_vertex>

				}
			`,fragmentShader:`
				uniform vec3 diffuse;
				uniform float opacity;
				uniform float linewidth;

				#ifdef USE_DASH

					uniform float dashOffset;
					uniform float dashSize;
					uniform float gapSize;

				#endif

				varying float vLineDistance;

				#ifdef WORLD_UNITS

					varying vec4 worldPos;
					varying vec3 worldStart;
					varying vec3 worldEnd;

					#ifdef USE_DASH

						varying vec2 vUv;

					#endif

				#else

					varying vec2 vUv;

				#endif

				#include <common>
				#include <fog_pars_fragment>
				#include <logdepthbuf_pars_fragment>
				#include <clipping_planes_pars_fragment>

				#ifdef USE_COLOR
					#ifdef USE_LINE_COLOR_ALPHA
						varying vec4 vLineColor;
					#else
						varying vec3 vLineColor;
					#endif
				#endif

				vec2 closestLineToLine(vec3 p1, vec3 p2, vec3 p3, vec3 p4) {

					float mua;
					float mub;

					vec3 p13 = p1 - p3;
					vec3 p43 = p4 - p3;

					vec3 p21 = p2 - p1;

					float d1343 = dot( p13, p43 );
					float d4321 = dot( p43, p21 );
					float d1321 = dot( p13, p21 );
					float d4343 = dot( p43, p43 );
					float d2121 = dot( p21, p21 );

					float denom = d2121 * d4343 - d4321 * d4321;

					float numer = d1343 * d4321 - d1321 * d4343;

					mua = numer / denom;
					mua = clamp( mua, 0.0, 1.0 );
					mub = ( d1343 + d4321 * ( mua ) ) / d4343;
					mub = clamp( mub, 0.0, 1.0 );

					return vec2( mua, mub );

				}

				void main() {

					#include <clipping_planes_fragment>

					#ifdef USE_DASH

						if ( vUv.y < - 1.0 || vUv.y > 1.0 ) discard; // discard endcaps

						if ( mod( vLineDistance + dashOffset, dashSize + gapSize ) > dashSize ) discard; // todo - FIX

					#endif

					float alpha = opacity;

					#ifdef WORLD_UNITS

						// Find the closest points on the view ray and the line segment
						vec3 rayEnd = normalize( worldPos.xyz ) * 1e5;
						vec3 lineDir = worldEnd - worldStart;
						vec2 params = closestLineToLine( worldStart, worldEnd, vec3( 0.0, 0.0, 0.0 ), rayEnd );

						vec3 p1 = worldStart + lineDir * params.x;
						vec3 p2 = rayEnd * params.y;
						vec3 delta = p1 - p2;
						float len = length( delta );
						float norm = len / linewidth;

						#ifndef USE_DASH

							#ifdef USE_ALPHA_TO_COVERAGE

								float dnorm = fwidth( norm );
								alpha = 1.0 - smoothstep( 0.5 - dnorm, 0.5 + dnorm, norm );

							#else

								if ( norm > 0.5 ) {

									discard;

								}

							#endif

						#endif

					#else

						#ifdef USE_ALPHA_TO_COVERAGE

							// artifacts appear on some hardware if a derivative is taken within a conditional
							float a = vUv.x;
							float b = ( vUv.y > 0.0 ) ? vUv.y - 1.0 : vUv.y + 1.0;
							float len2 = a * a + b * b;
							float dlen = fwidth( len2 );

							if ( abs( vUv.y ) > 1.0 ) {

								alpha = 1.0 - smoothstep( 1.0 - dlen, 1.0 + dlen, len2 );

							}

						#else

							if ( abs( vUv.y ) > 1.0 ) {

								float a = vUv.x;
								float b = ( vUv.y > 0.0 ) ? vUv.y - 1.0 : vUv.y + 1.0;
								float len2 = a * a + b * b;

								if ( len2 > 1.0 ) discard;

							}

						#endif

					#endif

					vec4 diffuseColor = vec4( diffuse, alpha );
					#ifdef USE_COLOR
						#ifdef USE_LINE_COLOR_ALPHA
							diffuseColor *= vLineColor;
						#else
							diffuseColor.rgb *= vLineColor;
						#endif
					#endif

					#include <logdepthbuf_fragment>

					gl_FragColor = diffuseColor;

					#include <tonemapping_fragment>
					#include <${re>=154?"colorspace_fragment":"encodings_fragment"}>
					#include <fog_fragment>
					#include <premultiplied_alpha_fragment>

				}
			`,clipping:!0}),this.isLineMaterial=!0,this.onBeforeCompile=function(){this.transparent?this.defines.USE_LINE_COLOR_ALPHA="1":delete this.defines.USE_LINE_COLOR_ALPHA},Object.defineProperties(this,{color:{enumerable:!0,get:function(){return this.uniforms.diffuse.value},set:function(n){this.uniforms.diffuse.value=n}},worldUnits:{enumerable:!0,get:function(){return"WORLD_UNITS"in this.defines},set:function(n){n===!0?this.defines.WORLD_UNITS="":delete this.defines.WORLD_UNITS}},linewidth:{enumerable:!0,get:function(){return this.uniforms.linewidth.value},set:function(n){this.uniforms.linewidth.value=n}},dashed:{enumerable:!0,get:function(){return"USE_DASH"in this.defines},set(n){!!n!="USE_DASH"in this.defines&&(this.needsUpdate=!0),n===!0?this.defines.USE_DASH="":delete this.defines.USE_DASH}},dashScale:{enumerable:!0,get:function(){return this.uniforms.dashScale.value},set:function(n){this.uniforms.dashScale.value=n}},dashSize:{enumerable:!0,get:function(){return this.uniforms.dashSize.value},set:function(n){this.uniforms.dashSize.value=n}},dashOffset:{enumerable:!0,get:function(){return this.uniforms.dashOffset.value},set:function(n){this.uniforms.dashOffset.value=n}},gapSize:{enumerable:!0,get:function(){return this.uniforms.gapSize.value},set:function(n){this.uniforms.gapSize.value=n}},opacity:{enumerable:!0,get:function(){return this.uniforms.opacity.value},set:function(n){this.uniforms.opacity.value=n}},resolution:{enumerable:!0,get:function(){return this.uniforms.resolution.value},set:function(n){this.uniforms.resolution.value.copy(n)}},alphaToCoverage:{enumerable:!0,get:function(){return"USE_ALPHA_TO_COVERAGE"in this.defines},set:function(n){!!n!="USE_ALPHA_TO_COVERAGE"in this.defines&&(this.needsUpdate=!0),n===!0?(this.defines.USE_ALPHA_TO_COVERAGE="",this.extensions.derivatives=!0):(delete this.defines.USE_ALPHA_TO_COVERAGE,this.extensions.derivatives=!1)}}}),this.setValues(e)}}const R=new B,Z=new E,K=new E,p=new B,m=new B,w=new B,T=new E,I=new ve,h=new he,Q=new E,C=new G,j=new ie,S=new B;let b,A;function ee(t,e,n){return S.set(0,0,-e,1).applyMatrix4(t.projectionMatrix),S.multiplyScalar(1/S.w),S.x=A/n.width,S.y=A/n.height,S.applyMatrix4(t.projectionMatrixInverse),S.multiplyScalar(1/S.w),Math.abs(Math.max(S.x,S.y))}function _e(t,e){const n=t.matrixWorld,s=t.geometry,i=s.attributes.instanceStart,o=s.attributes.instanceEnd,a=Math.min(s.instanceCount,i.count);for(let r=0,d=a;r<d;r++){h.start.fromBufferAttribute(i,r),h.end.fromBufferAttribute(o,r),h.applyMatrix4(n);const c=new E,g=new E;b.distanceSqToSegment(h.start,h.end,g,c),g.distanceTo(c)<A*.5&&e.push({point:g,pointOnLine:c,distance:b.origin.distanceTo(g),object:t,face:null,faceIndex:r,uv:null,[ae]:null})}}function Le(t,e,n){const s=e.projectionMatrix,o=t.material.resolution,a=t.matrixWorld,r=t.geometry,d=r.attributes.instanceStart,c=r.attributes.instanceEnd,g=Math.min(r.instanceCount,d.count),u=-e.near;b.at(1,w),w.w=1,w.applyMatrix4(e.matrixWorldInverse),w.applyMatrix4(s),w.multiplyScalar(1/w.w),w.x*=o.x/2,w.y*=o.y/2,w.z=0,T.copy(w),I.multiplyMatrices(e.matrixWorldInverse,a);for(let x=0,D=g;x<D;x++){if(p.fromBufferAttribute(d,x),m.fromBufferAttribute(c,x),p.w=1,m.w=1,p.applyMatrix4(I),m.applyMatrix4(I),p.z>u&&m.z>u)continue;if(p.z>u){const l=p.z-m.z,y=(p.z-u)/l;p.lerp(m,y)}else if(m.z>u){const l=m.z-p.z,y=(m.z-u)/l;m.lerp(p,y)}p.applyMatrix4(s),m.applyMatrix4(s),p.multiplyScalar(1/p.w),m.multiplyScalar(1/m.w),p.x*=o.x/2,p.y*=o.y/2,m.x*=o.x/2,m.y*=o.y/2,h.start.copy(p),h.start.z=0,h.end.copy(m),h.end.z=0;const M=h.closestPointToPointParameter(T,!0);h.at(M,Q);const U=ge.lerp(p.z,m.z,M),L=U>=-1&&U<=1,P=T.distanceTo(Q)<A*.5;if(L&&P){h.start.fromBufferAttribute(d,x),h.end.fromBufferAttribute(c,x),h.start.applyMatrix4(a),h.end.applyMatrix4(a);const l=new E,y=new E;b.distanceSqToSegment(h.start,h.end,y,l),n.push({point:y,pointOnLine:l,distance:b.origin.distanceTo(y),object:t,face:null,faceIndex:x,uv:null,[ae]:null})}}}class ce extends me{constructor(e=new N,n=new V({color:Math.random()*16777215})){super(e,n),this.isLineSegments2=!0,this.type="LineSegments2"}computeLineDistances(){const e=this.geometry,n=e.attributes.instanceStart,s=e.attributes.instanceEnd,i=new Float32Array(2*n.count);for(let a=0,r=0,d=n.count;a<d;a++,r+=2)Z.fromBufferAttribute(n,a),K.fromBufferAttribute(s,a),i[r]=r===0?0:i[r-1],i[r+1]=i[r]+Z.distanceTo(K);const o=new H(i,2,1);return e.setAttribute("instanceDistanceStart",new z(o,1,0)),e.setAttribute("instanceDistanceEnd",new z(o,1,1)),this}raycast(e,n){const s=this.material.worldUnits,i=e.camera;i===null&&!s&&console.error('LineSegments2: "Raycaster.camera" needs to be set in order to raycast against LineSegments2 while worldUnits is set to false.');const o=e.params.Line2!==void 0&&e.params.Line2.threshold||0;b=e.ray;const a=this.matrixWorld,r=this.geometry,d=this.material;A=d.linewidth+o,r.boundingSphere===null&&r.computeBoundingSphere(),j.copy(r.boundingSphere).applyMatrix4(a);let c;if(s)c=A*.5;else{const u=Math.max(i.near,j.distanceToPoint(b.origin));c=ee(i,u,d.resolution)}if(j.radius+=c,b.intersectsSphere(j)===!1)return;r.boundingBox===null&&r.computeBoundingBox(),C.copy(r.boundingBox).applyMatrix4(a);let g;if(s)g=A*.5;else{const u=Math.max(i.near,C.distanceToPoint(b.origin));g=ee(i,u,d.resolution)}C.expandByScalar(g),b.intersectsBox(C)!==!1&&(s?_e(this,n):Le(this,i,n))}onBeforeRender(e){const n=this.material.uniforms;n&&n.resolution&&(e.getViewport(R),this.material.uniforms.resolution.value.set(R.z,R.w))}}class Ae extends ce{constructor(e=new le,n=new V({color:Math.random()*16777215})){super(e,n),this.isLine2=!0,this.type="Line2"}}const Me=f.forwardRef(function({points:e,color:n=16777215,vertexColors:s,linewidth:i,lineWidth:o,segments:a,dashed:r,...d},c){var g,u;const x=oe(L=>L.size),D=f.useMemo(()=>a?new ce:new Ae,[a]),[_]=f.useState(()=>new V),M=(s==null||(g=s[0])==null?void 0:g.length)===4?4:3,U=f.useMemo(()=>{const L=a?new N:new le,P=e.map(l=>{const y=Array.isArray(l);return l instanceof E||l instanceof B?[l.x,l.y,l.z]:l instanceof se?[l.x,l.y,0]:y&&l.length===3?[l[0],l[1],l[2]]:y&&l.length===2?[l[0],l[1],0]:l});if(L.setPositions(P.flat()),s){n=16777215;const l=s.map(y=>y instanceof ye?y.toArray():y);L.setColors(l.flat(),M)}return L},[e,a,s,M]);return f.useLayoutEffect(()=>{D.computeLineDistances()},[e,D]),f.useLayoutEffect(()=>{r?_.defines.USE_DASH="":delete _.defines.USE_DASH,_.needsUpdate=!0},[r,_]),f.useEffect(()=>()=>{U.dispose(),_.dispose()},[U]),f.createElement("primitive",W({object:D,ref:c},d),f.createElement("primitive",{object:U,attach:"geometry"}),f.createElement("primitive",W({object:_,attach:"material",color:n,vertexColors:!!s,resolution:[x.width,x.height],linewidth:(u=i??o)!==null&&u!==void 0?u:1,dashed:r,transparent:M===4},d)))}),Ue=f.forwardRef(({threshold:t=15,geometry:e,...n},s)=>{const i=f.useRef(null);f.useImperativeHandle(s,()=>i.current,[]);const o=f.useMemo(()=>[0,0,0,1,0,0],[]),a=f.useRef(null),r=f.useRef(null);return f.useLayoutEffect(()=>{const d=i.current.parent,c=e??(d==null?void 0:d.geometry);if(!c||a.current===c&&r.current===t)return;a.current=c,r.current=t;const u=new xe(c,t).attributes.position.array;i.current.geometry.setPositions(u),i.current.geometry.attributes.instanceStart.needsUpdate=!0,i.current.geometry.attributes.instanceEnd.needsUpdate=!0,i.current.computeLineDistances()}),f.createElement(Me,W({segments:!0,points:o,ref:i,raycast:()=>null},n))});function ze(t,e){switch(t.solid){case"cube":return new X(t.a,t.a,t.a);case"box":return new X(t.a,t.h,t.b);case"prism":return new J(t.a/Math.sqrt(3),t.a/Math.sqrt(3),t.h,3);case"pyramid":{const n=new $(t.a/Math.sqrt(2),t.h,4);return n.rotateY(Math.PI/4),n}case"cylinder":return new J(t.r,t.r,t.h,e==="low"?24:64);case"cone":return new $(t.r,t.h,e==="low"?24:64);case"sphere":return new Ee(t.r,e==="low"?20:48,e==="low"?12:32)}}function te({c:t,p:e,offset:n=0,scale:s=1}){const i=f.useMemo(()=>ze(t,e.quality),[t.solid,t.a,t.b,t.h,t.r,e.quality]);f.useEffect(()=>()=>i.dispose(),[i]);const o=f.useMemo(()=>{if(["sphere","cylinder"].includes(t.solid))return[];if(t.solid==="cone")return[[0,t.h/2,0]];const a=i.getAttribute("position"),r=new Map;for(let d=0;d<a.count;d++){const c=[a.getX(d),a.getY(d),a.getZ(d)];t.solid==="prism"&&Math.hypot(c[0],c[2])<.001||t.solid==="pyramid"&&Math.hypot(c[0],c[2])<.001&&c[1]<0||r.set(c.map(g=>g.toFixed(5)).join(),c)}return[...r.values()]},[i,t.solid,t.h]);return v.jsxs("group",{position:[n,0,0],scale:s,rotation:[0,e.rotation,0],children:[v.jsxs("mesh",{geometry:i,children:[v.jsx("meshStandardMaterial",{color:n>0?"#ac7cf5":"#398ef4",transparent:!0,opacity:e.faces?.8:.06,roughness:.36,metalness:.08,side:Se}),e.edges&&v.jsx(Ue,{threshold:25,color:"#12365e",lineWidth:2})]}),e.vertices&&o.map((a,r)=>v.jsxs("mesh",{position:a,children:[v.jsx("sphereGeometry",{args:[.08/s,10,8]}),v.jsx("meshBasicMaterial",{color:"#f58726"})]},r))]})}function Be({p:t}){const{camera:e,gl:n}=oe();return f.useEffect(()=>{const s={perspective:[8,6,8],front:[0,0,12],top:[0,12,.001],side:[12,0,0]},i=s[t.view]??s.perspective;e.position.set(i[0]/t.zoom,i[1]/t.zoom,i[2]/t.zoom),e.lookAt(0,0,0),e.updateProjectionMatrix()},[e,t.view,t.zoom]),f.useEffect(()=>{const s=i=>{i.preventDefault(),t.onFailure()};return n.domElement.addEventListener("webglcontextlost",s),()=>n.domElement.removeEventListener("webglcontextlost",s)},[n,t.onFailure]),v.jsx(be,{makeDefault:!0,enablePan:!1,minDistance:3,maxDistance:30,autoRotate:t.running,autoRotateSpeed:t.speed,enableDamping:!1})}function ne(t){switch(t.solid){case"cube":return t.a;case"box":return Math.max(t.a,t.b,t.h);case"prism":return Math.max(2*t.a/Math.sqrt(3),t.h);case"pyramid":return Math.max(t.a,t.h);case"sphere":return 2*t.r;default:return Math.max(2*t.r,t.h)}}function Ce(t){const e=i=>t.comparison&&i.unit==="m"?100:1,n=Math.max(ne(t.config)*e(t.config),t.comparison?ne(t.comparison)*e(t.comparison):0),s=(t.comparison?3.6:5)/n;return v.jsxs(we,{frameloop:t.running?"always":"demand",dpr:t.quality==="low"?1:[1,1.5],camera:{position:[8,6,8],fov:42},gl:{antialias:t.quality==="high",powerPreference:"low-power"},fallback:v.jsx("p",{children:"WebGL indisponível. Selecione a visualização 2D."}),children:[v.jsx("ambientLight",{intensity:1.5}),v.jsx("directionalLight",{position:[6,8,5],intensity:2}),v.jsx("directionalLight",{position:[-4,2,-3],intensity:1,color:"#b7cbff"}),v.jsx(te,{c:t.config,p:t,offset:t.comparison?-2.4:0,scale:s*e(t.config)}),t.comparison&&v.jsx(te,{c:t.comparison,p:t,offset:2.4,scale:s*e(t.comparison)}),v.jsx("gridHelper",{args:[18,18,"#b6c9e0","#dae4f0"],position:[0,-3.2,0]}),v.jsx(Be,{p:t})]})}export{Ce as default};
