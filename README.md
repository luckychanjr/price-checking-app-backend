# price-checking-app-backend
Price checking app that notifies user when bookmarked item is on sale.

Please submit:

    Final presentation slides
    Final report
    Link to code repository, if applicable

The content of your presentation and report will vary depending on the type of project you are conducting.  At a minimum, you should:

    Describe the background and motivation for the project.  Describe any related work (publications and/or code) and how you are building on this work.

    Describe and discuss the tools and technologies used for your implementation.  Why did you choose these specific tools and technologies as opposed to alternatives?
    
    Describe specifics of the implementation.  Describe the structure of the code.  
    
    Draw diagrams as appropriate to illustrate data schemas, object hierarchies, etc.  
    
    Describe algorithms used, datasets, and software/hardware setup.  
    - Designed to be compatible with any Android app. I use React/React Native instead of Kotlin or Swift, so it theoretically should also work with iPhone, but I don't have access to Xcode.
    
    Describe any challenges faced during implementation and their resolutions.
    - Communicating with retailer APIs: This was by far the most difficult part of the project because each one works differently. 
    - Why retailer APIs? These return clean, reliable .json instead of simlper but more fragile alternatives like page crawling.
    - Normalization layer: This was needed to aggregate what my system believes is the same product from multiple retailers.

    Describe any extensions or future work that you envision.
    - Utilizing EventBridge for phone notifications 
    - Tracking price history over last XX months for saved items
    - Adding more retailers (Target, Amazon, etc.)
