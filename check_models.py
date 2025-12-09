
import google.generativeai as genai

genai.configure(api_key="AIzaSyBhuHhc4MHSVNlazZCQ44kibmzjpW-M0e0")

print("Listing available models:")
for m in genai.list_models():
    if 'generateContent' in m.supported_generation_methods:
        print(m.name)
